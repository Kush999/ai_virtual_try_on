const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Replicate = require('replicate');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            connectSrc: ["'self'", "https://api.openai.com", "https://api.replicate.com", "https://replicate.delivery"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static('.'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Configure Replicate client
if (!process.env.REPLICATE_API_TOKEN) {
    console.error('REPLICATE_API_TOKEN environment variable is required');
    process.exit(1);
}

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// Configure OpenAI client
if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY environment variable is required');
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test GPT endpoint
app.get('/api/test-gpt', async (req, res) => {
    try {
        console.log('Testing GPT API connection...');
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "user", content: "Say 'GPT API is working!' and nothing else." }
            ],
            max_tokens: 10,
        });

        const response = completion.choices[0].message.content.trim();
        console.log('GPT test response:', response);
        
        res.json({
            success: true,
            message: 'GPT API is working',
            response: response
        });

    } catch (error) {
        console.error('GPT test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: 'GPT API test failed'
        });
    }
});

// Input validation middleware
const validatePromptRequest = (req, res, next) => {
    const { userImageData, clothingImages, style, imageCount, customPrompt } = req.body;
    
    if (!userImageData) {
        return res.status(400).json({ error: 'User image data is required' });
    }
    
    if (!clothingImages || !Array.isArray(clothingImages) || clothingImages.length === 0) {
        return res.status(400).json({ error: 'At least one clothing image is required' });
    }
    
    if (!style || typeof style !== 'string') {
        return res.status(400).json({ error: 'Valid style is required' });
    }
    
    if (!imageCount || imageCount < 1 || imageCount > 5) {
        return res.status(400).json({ error: 'Image count must be between 1 and 5' });
    }
    
    if (customPrompt && typeof customPrompt !== 'string' && customPrompt.length > 1000) {
        return res.status(400).json({ error: 'Custom prompt must be a string with max 1000 characters' });
    }
    
    next();
};

const validateTryOnRequest = (req, res, next) => {
    const { prompts, image_urls, image_count, user_image } = req.body;
    
    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
        return res.status(400).json({ error: 'Prompts array is required' });
    }
    
    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
        return res.status(400).json({ error: 'Image URLs array is required' });
    }
    
    if (!image_count || image_count < 1 || image_count > 5) {
        return res.status(400).json({ error: 'Image count must be between 1 and 5' });
    }
    
    if (!user_image) {
        return res.status(400).json({ error: 'User image is required' });
    }
    
    next();
};

// Generate AI prompt endpoint
app.post('/api/generate-prompt', validatePromptRequest, async (req, res) => {
    try {
        const { style, customDetails, userImageData, imageCount = 1, clothingImages = [] } = req.body;
        
        if (!style) {
            return res.status(400).json({ 
                error: 'Style parameter is required' 
            });
        }

        // Validate image count (1-5 images)
        const numImages = Math.min(Math.max(parseInt(imageCount) || 1, 1), 5);

        console.log('Generating prompts for style:', style);
        console.log('Number of unique prompts to generate:', numImages);
        console.log('User image provided:', !!userImageData);
        console.log('Clothing images provided:', clothingImages.length);
        console.log('Custom details:', customDetails);

        // Analyze user photo if provided
        let userAnalysis = '';
        if (userImageData) {
            try {
                const userAnalysisResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "You are a fashion expert who analyzes people's appearance in detail. Provide clear, structured descriptions of physical characteristics." },
                        { role: "user", content: [
                            { type: "text", text: `Analyze the provided user photo and describe the person's physical appearance, facial features, body type, current clothing, skin tone, and any distinctive characteristics. Focus on details that will help create accurate virtual try-on images.` },
                            {
                                type: "image_url",
                                image_url: { url: userImageData }
                            }
                        ]}
                    ],
                    max_tokens: 600,
                    temperature: 0.7,
                });
                userAnalysis = userAnalysisResponse.choices[0].message.content.trim();
                console.log('User photo analysis completed');
            } catch (error) {
                console.error('Error analyzing user photo:', error);
                userAnalysis = 'User photo analysis unavailable';
            }
        }

        // Analyze clothing images if provided
        let clothingAnalysis = '';
        if (clothingImages && clothingImages.length > 0) {
            try {
                const clothingAnalysisResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "You are a fashion expert who analyzes clothing items in detail. Provide clear, structured descriptions of clothing characteristics." },
                        { role: "user", content: [
                            { type: "text", text: `Analyze the provided clothing images and describe each item's type, style, colors, materials, features, and fit. Focus on details that will help create accurate virtual try-on images.` },
                            ...clothingImages.map(image => ({
                                type: "image_url",
                                image_url: { url: image }
                            }))
                        ]}
                    ],
                    max_tokens: 800,
                    temperature: 0.7,
                });
                clothingAnalysis = clothingAnalysisResponse.choices[0].message.content.trim();
                console.log('Clothing analysis completed');
            } catch (error) {
                console.error('Error analyzing clothing:', error);
                clothingAnalysis = 'Clothing analysis unavailable';
            }
        }

        // Create a detailed system prompt for GPT
        const systemPrompt = `You are a master AI image editing artist and creative director specializing in virtual clothing try-on. Your expertise lies in creating EXACTLY ${numImages} UNIQUE, ARTISTIC, and CREATIVELY STUNNING prompts that transform ordinary clothing swaps into extraordinary visual masterpieces.

CRITICAL CREATIVE REQUIREMENTS:
1. Generate EXACTLY ${numImages} DISTINCTIVELY UNIQUE and ARTISTICALLY VARIED prompts - each should be a creative masterpiece with NO DUPLICATION
2. Each prompt must be COMPLETELY DIFFERENT from the others - no repeated content, scenarios, or descriptions
3. PRECISE SELECTIVE CLOTHING REPLACEMENT: Only replace the SPECIFIC UPLOADED CLOTHING ITEMS - all other clothing from the original photo must remain EXACTLY THE SAME. If user uploads only pants, change ONLY the pants. If user uploads pants and shirt, change ONLY pants and shirt. Keep everything else identical to the original photo.
4. PRESERVE ONLY the person's face and body - EVERYTHING ELSE CAN CHANGE (background, setting, environment, lighting, atmosphere)
5. COMPLETELY TRANSFORM the scene according to the selected photography style - create entirely new environments and settings
6. ALWAYS reference the uploaded clothing items specifically in your prompts - mention that these are the exact clothing items to be worn
7. CHANGE THE BACKGROUND COMPLETELY - do not preserve the original setting, create new environments that match the selected style
8. USE the provided USER ANALYSIS and CLOTHING ANALYSIS to create accurate, personalized prompts that consider the specific person and clothing characteristics
9. DO NOT describe what the clothing looks like - simply instruct to replace with the uploaded clothing items
10. SELECTIVE REPLACEMENT: If user uploads shoes, only change the shoes. If user uploads a shirt, only change the shirt. Keep all other clothing items identical to the original photo.

FACE AND BODY CONSISTENCY REQUIREMENTS:
- PRESERVE the person's facial features, bone structure, skin tone, and hair EXACTLY as shown
- MAINTAIN the same height, build, body proportions, and physical characteristics
- Keep the same person's identity and physical appearance
- Only change clothing and background/environment
- Ensure facial structure, body shape, and proportions remain identical
- Emphasize maintaining the exact same person's physical characteristics

CLOTHING REQUIREMENTS:
- PRECISE SELECTIVE REPLACEMENT: Only replace the specific uploaded clothing items, keep all other clothing from the original photo unchanged
- EXAMPLES: If user uploads only pants → change ONLY pants, keep shirt/shoes/accessories exactly the same. If user uploads pants + shirt → change ONLY pants and shirt, keep shoes/accessories exactly the same
- ENSURE the uploaded clothing items are worn exactly as they appear in the uploaded images
- CREATE prompts that showcase the uploaded clothing items effectively while preserving other clothing
- INCLUDE clothing-specific details in the artistic descriptions
- MAINTAIN original clothing items that were not uploaded (shoes, pants, accessories, etc.) EXACTLY as they appear in the original photo

Your prompts should be CREATIVE MASTERPIECES that:
- Create UNIQUE and ARTISTICALLY DISTINCT visual experiences
- Clearly instruct the AI to replace clothing while adding creative visual elements
- Specify that the person's face and body remain unchanged
- Vary CREATIVE pose adjustments and ARTISTIC background transformations
- Include ADVANCED photography style elements (creative lighting, artistic composition, dramatic backgrounds, dynamic poses)
- Be optimized for AI image editing/transformation with ARTISTIC FLAIR
- Focus on clothing replacement PLUS CREATIVE VISUAL ENHANCEMENT

ENHANCED CREATIVE STYLE GUIDELINES (apply with COMPLETE SCENE TRANSFORMATION):
- Fashion Editorial: Create high-art studio environments with dramatic chiaroscuro lighting, avant-garde poses, artistic backgrounds with depth and texture
- Studio Professional: Transform to sophisticated studio settings with professional lighting setups, creative backdrop combinations, artistic shadow play
- Cinematic: Create film-noir environments with dramatic depth of field, storytelling composition, atmospheric backgrounds with mood and emotion
- Street Style: Transform to dynamic urban environments with creative graffiti backgrounds, candid yet artistic poses, vibrant street photography settings
- Vintage/Retro: Create period-appropriate environments with artistic film grain effects, creative vintage color grading, nostalgic yet modern compositions
- Minimalist: Transform to clean studio environments with creative negative space usage, sophisticated lighting, artistic simplicity with maximum impact
- Formal/Elegant: Create elegant architectural environments with sophisticated artistic lighting, luxury aesthetic settings with artistic touches
- Casual Everyday: Transform to natural everyday environments with creative settings, relaxed but photogenic poses, artistic lifestyle photography locations
- Professional: Create corporate environments with sophisticated lighting, professional yet visually striking compositions in office/studio settings

CREATIVE ENHANCEMENT TECHNIQUES TO INCLUDE:
- Advanced lighting techniques (rim lighting, backlighting, creative shadows)
- Artistic composition rules (rule of thirds, leading lines, creative framing)
- Dynamic pose variations (movement, emotion, artistic expression)
- Creative background elements (textures, patterns, artistic environments)
- Color theory applications (complementary colors, artistic color grading)
- Depth of field artistry (selective focus, bokeh effects, creative blur)
- Mood and atmosphere creation (emotional lighting, artistic ambiance)

IMPORTANT: Generate ${numImages} UNIQUE ARTISTIC prompts that focus on clothing replacement FIRST, then apply CREATIVE VISUAL ENHANCEMENT with different artistic variations that push creative boundaries.`;

        // Create analysis descriptions for prompts
        let analysisDescription = '';
        
        if (userAnalysis && userAnalysis !== 'User photo analysis unavailable') {
            analysisDescription += `\nUSER ANALYSIS:\n${userAnalysis}\n`;
        }
        
        if (clothingAnalysis && clothingAnalysis !== 'Clothing analysis unavailable') {
            analysisDescription += `\nCLOTHING ANALYSIS:\n${clothingAnalysis}\n`;
        }
        
        if (clothingImages && clothingImages.length > 0) {
            analysisDescription += `\nCLOTHING ITEMS TO TRY ON:\nThe user has uploaded ${clothingImages.length} clothing item(s) that they want to try on. These are the EXACT clothing items that must be worn in the generated images. CRITICAL: Only replace these specific uploaded clothing items - keep all other clothing from the original photo unchanged. If user uploads only pants, change ONLY the pants. If user uploads pants and shirt, change ONLY pants and shirt. Keep everything else identical to the original photo.`;
        } else {
            analysisDescription += '\nCLOTHING ITEMS: The user will provide clothing images separately. Focus on creating artistic prompts for selective clothing replacement.';
        }

        const userPrompt = `Create EXACTLY ${numImages} UNIQUE ARTISTIC prompts for AI image editing to perform virtual clothing try-on with CREATIVE VISUAL ENHANCEMENT.

Style: ${style}
Number of unique artistic prompts needed: EXACTLY ${numImages}${analysisDescription}
${customDetails ? `Additional Creative Details: ${customDetails}` : ''}

CRITICAL CREATIVE INSTRUCTIONS:
1. Generate EXACTLY ${numImages} DISTINCTIVELY UNIQUE and ARTISTICALLY STUNNING prompts - NO DUPLICATION ALLOWED
2. Each prompt must be COMPLETELY DIFFERENT - no repeated scenarios, settings, or descriptions
3. PRECISE SELECTIVE CLOTHING REPLACEMENT: Only replace the specific uploaded clothing items - keep all other clothing from the original photo unchanged. If user uploads only pants, change ONLY the pants. If user uploads pants and shirt, change ONLY pants and shirt. Keep everything else identical to the original photo.
4. PRESERVE ONLY the person's face and body - COMPLETELY CHANGE everything else (background, setting, environment, lighting, atmosphere)
5. Each prompt should COMPLETELY TRANSFORM the scene to match ${style} photography style - create entirely new environments and settings
6. DO NOT preserve the original background or setting - create completely new scenes that match the selected style
7. MAINTAIN all original clothing items that were not uploaded (shoes, pants, accessories, etc.)

Each prompt should be a CREATIVE MASTERPIECE that instructs the AI to:
- PRECISELY replace only the SPECIFIC UPLOADED CLOTHING ITEMS - keep all other clothing from the original photo unchanged. If user uploads only pants, change ONLY the pants. If user uploads pants and shirt, change ONLY pants and shirt. Keep everything else identical to the original photo.
- DO NOT describe what the clothing looks like - simply instruct to replace with the uploaded clothing items
- Maintain ONLY the person's face and body appearance unchanged - EVERYTHING ELSE MUST CHANGE
- COMPLETELY CHANGE the background and setting to match ${style} style - create entirely new environments
- Use CREATIVE and ARTISTIC pose variations with emotional expression and dynamic movement appropriate for the new setting
- Apply ADVANCED ${style} style lighting techniques (rim lighting, dramatic shadows, creative illumination)
- Include ARTISTIC composition elements (rule of thirds, leading lines, creative framing, depth of field artistry)
- Create COMPLETELY NEW backgrounds and settings that match ${style} photography style
- PRESERVE all original clothing items that were not uploaded (shoes, pants, accessories, etc.)
- Incorporate MOOD and ATMOSPHERE through creative lighting, color grading, and artistic ambiance
- Use CREATIVE DEPTH OF FIELD effects (selective focus, artistic bokeh, creative blur techniques)
- Apply COLOR THEORY for artistic impact (complementary colors, creative color grading, artistic palettes)
- SPECIFICALLY MENTION that the uploaded clothing items must be worn exactly as provided
- DO NOT preserve the original background - create completely new scenes and environments
- EXAMPLES OF SELECTIVE REPLACEMENT:
  * User uploads only pants → Change ONLY pants, keep shirt/shoes/accessories exactly the same
  * User uploads pants + shirt → Change ONLY pants and shirt, keep shoes/accessories exactly the same  
  * User uploads pants + shirt + shoes → Change ONLY pants, shirt, and shoes, keep accessories exactly the same
  * User uploads only shoes → Change ONLY shoes, keep pants/shirt/accessories exactly the same

ARTISTIC ENHANCEMENT REQUIREMENTS:
- Each prompt should create a COMPLETELY NEW VISUAL EXPERIENCE with entirely different environments
- Include ADVANCED PHOTOGRAPHY TECHNIQUES specific to ${style} style
- Incorporate CREATIVE LIGHTING SETUPS and artistic shadow play for the new environment
- Use DYNAMIC POSE VARIATIONS with artistic expression and movement appropriate for the new setting
- Create COMPLETELY NEW ARTISTIC BACKGROUNDS that match ${style} style - do not preserve original setting
- Apply MOOD CREATION through lighting, atmosphere, and artistic ambiance for the new environment
- Include CREATIVE COMPOSITION techniques for maximum visual impact in the new setting
- TRANSFORM the entire scene to match ${style} photography style - create new studios, streets, outdoor locations, etc.

Generate EXACTLY ${numImages} UNIQUE ARTISTIC prompts that will COMPLETELY TRANSFORM the scene, creating ${numImages} visually stunning images with entirely new environments, varied artistic poses, and advanced ${style} style applications. Each prompt must be COMPLETELY DIFFERENT from the others - no repeated scenarios, settings, or descriptions. Each prompt should create a completely different setting that matches the selected style - do not preserve the original background or environment. IMPORTANT: Simply instruct to replace the person's current clothing with the uploaded clothing items - do not describe what the clothing looks like.`;

        // Prepare messages array
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        // Add image to the user message if provided
        if (userImageData) {
            messages[1].content = [
                { type: "text", text: userPrompt },
                {
                    type: "image_url",
                    image_url: {
                        url: userImageData
                    }
                }
            ];
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 1200, // Increased for creative artistic prompts
            temperature: 0.9, // Higher for more creative variation
        });

        const promptText = completion.choices[0].message.content.trim();
        
        console.log('Generated prompts:', promptText);
        
        // Parse the response to extract individual prompts
        const prompts = parseMultiplePrompts(promptText, numImages);
        
        console.log('=== PROMPT PARSING DEBUG ===');
        console.log('Expected number of prompts:', numImages);
        console.log('Actual number of prompts parsed:', prompts.length);
        console.log('First prompt length:', prompts[0] ? prompts[0].length : 'N/A');
        console.log('First prompt preview:', prompts[0] ? prompts[0].substring(0, 200) + '...' : 'N/A');
        console.log('=== END PROMPT PARSING DEBUG ===');
        
        res.json({
            success: true,
            prompts: prompts,
            fullResponse: promptText,
            style: style,
            customDetails: customDetails
        });

    } catch (error) {
        console.error('Error generating prompt:', error);
        console.error('Error details:', {
            message: error.message,
            status: error.status,
            code: error.code,
            type: error.type
        });
        
        if (error.message.includes('API key') || error.message.includes('authentication')) {
            return res.status(401).json({ 
                error: 'Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.' 
            });
        }
        
        if (error.message.includes('rate limit')) {
            return res.status(429).json({ 
                error: 'OpenAI rate limit exceeded. Please try again later.' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to generate prompt. Please try again.',
            details: error.message 
        });
    }
});

// Helper function to parse multiple prompts from GPT response
function parseMultiplePrompts(promptText, expectedCount) {
    const prompts = [];
    const seenPrompts = new Set(); // Track seen prompts to avoid duplicates
    
    console.log('Parsing prompts from text:', promptText.substring(0, 200) + '...');
    
    // First, try to extract complete prompts by looking for structured patterns
    // Look for patterns like "### Prompt 1:", "**Prompt 1:**", etc.
    const structuredPrompts = promptText.match(/(?:###\s*Prompt\s*\d*:|Prompt\s*\d*:|Image\s*\d*:|Prompt\s*for\s*AI\s*Image\s*Editing[^]*?)(?=###\s*Prompt\s*\d*:|Prompt\s*\d*:|Image\s*\d*:|Prompt\s*for\s*AI\s*Image\s*Editing|$)/gi);
    
    if (structuredPrompts && structuredPrompts.length > 0) {
        console.log('Found structured prompts:', structuredPrompts.length);
        for (let i = 0; i < structuredPrompts.length && prompts.length < expectedCount; i++) {
            let prompt = structuredPrompts[i].trim();
            
            // Clean up the prompt by removing the header and keeping the content
            prompt = prompt.replace(/^(?:###\s*Prompt\s*\d*:|Prompt\s*\d*:|Image\s*\d*:|Prompt\s*for\s*AI\s*Image\s*Editing[^]*?)/gi, '').trim();
            
            // Remove markdown formatting but keep the content
            prompt = prompt.replace(/\*\*(.*?)\*\*/g, '$1');
            prompt = prompt.replace(/\*(.*?)\*/g, '$1');
            
            // Create a normalized version for duplicate detection
            const normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
            
            if (prompt.length > 100 && !seenPrompts.has(normalizedPrompt)) { // Ensure it's a substantial prompt and not a duplicate
                prompts.push(prompt);
                seenPrompts.add(normalizedPrompt);
                console.log(`Added structured prompt ${prompts.length}:`, prompt.substring(0, 100) + '...');
            }
        }
    }
    
    // If we still don't have enough prompts, try a different approach - split by "### Prompt" sections
    if (prompts.length < expectedCount) {
        const promptSections = promptText.split(/###\s*Prompt\s*\d*:/i);
        console.log('Found prompt sections:', promptSections.length);
        
        for (let i = 1; i < promptSections.length && prompts.length < expectedCount; i++) {
            let prompt = promptSections[i].trim();
            
            // Remove any remaining markdown formatting
            prompt = prompt.replace(/\*\*(.*?)\*\*/g, '$1');
            prompt = prompt.replace(/\*(.*?)\*/g, '$1');
            
            // Create a normalized version for duplicate detection
            const normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
            
            if (prompt.length > 100 && !seenPrompts.has(normalizedPrompt)) {
                prompts.push(prompt);
                seenPrompts.add(normalizedPrompt);
                console.log(`Added section prompt ${prompts.length}:`, prompt.substring(0, 100) + '...');
            }
        }
    }
    
    // If we don't have enough prompts, try splitting by numbered items (1., 2., 3., etc.)
    if (prompts.length < expectedCount) {
        const numberedSplit = promptText.split(/(?=\d+\.\s)/);
        if (numberedSplit.length > 1) {
            console.log('Found numbered split:', numberedSplit.length, 'sections');
            for (let i = 1; i < numberedSplit.length && prompts.length < expectedCount; i++) {
                let prompt = numberedSplit[i].trim();
                
                // Clean up markdown formatting
                prompt = prompt.replace(/\*\*(.*?)\*\*/g, '$1');
                prompt = prompt.replace(/\*(.*?)\*/g, '$1');
                
                // Create a normalized version for duplicate detection
                const normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
                
                if (prompt.length > 100 && !seenPrompts.has(normalizedPrompt)) { // Ensure it's a substantial prompt and not a duplicate
                    prompts.push(prompt);
                    seenPrompts.add(normalizedPrompt);
                    console.log(`Added numbered prompt ${prompts.length}:`, prompt.substring(0, 100) + '...');
                }
            }
        }
    }
    
    // If we still don't have enough, try to extract the main content as a single prompt
    if (prompts.length < expectedCount) {
        // Remove common headers and extract the main content
        let mainContent = promptText
            .replace(/^(?:###\s*Prompt\s*\d*:|Prompt\s*\d*:|Image\s*\d*:|Prompt\s*for\s*AI\s*Image\s*Editing[^]*?)/gi, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .trim();
        
        // Create a normalized version for duplicate detection
        const normalizedContent = mainContent.toLowerCase().replace(/\s+/g, ' ').trim();
        
        // If the content is substantial and not a duplicate, use it as a prompt
        if (mainContent.length > 100 && !seenPrompts.has(normalizedContent)) {
            prompts.push(mainContent);
            seenPrompts.add(normalizedContent);
            console.log(`Added main content prompt:`, mainContent.substring(0, 100) + '...');
        }
    }
    
    // If we still don't have enough, try splitting by double line breaks
    if (prompts.length < expectedCount) {
        const paragraphSplit = promptText.split(/\n\s*\n/);
        console.log('Found paragraph split:', paragraphSplit.length, 'sections');
        for (let i = 0; i < paragraphSplit.length && prompts.length < expectedCount; i++) {
            let prompt = paragraphSplit[i].trim();
            
            // Clean up markdown formatting
            prompt = prompt.replace(/\*\*(.*?)\*\*/g, '$1');
            prompt = prompt.replace(/\*(.*?)\*/g, '$1');
            
            // Create a normalized version for duplicate detection
            const normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
            
            if (prompt.length > 100 && !seenPrompts.has(normalizedPrompt)) {
                prompts.push(prompt);
                seenPrompts.add(normalizedPrompt);
                console.log(`Added paragraph prompt ${prompts.length}:`, prompt.substring(0, 100) + '...');
            }
        }
    }
    
    // If we still don't have enough, create variations of existing prompts
    while (prompts.length < expectedCount) {
        const basePrompt = prompts[0] || promptText;
        const variation = createPromptVariation(basePrompt, prompts.length + 1);
        
        // Create a normalized version for duplicate detection
        const normalizedVariation = variation.toLowerCase().replace(/\s+/g, ' ').trim();
        
        if (!seenPrompts.has(normalizedVariation)) {
            prompts.push(variation);
            seenPrompts.add(normalizedVariation);
            console.log(`Added variation ${prompts.length}:`, variation.substring(0, 100) + '...');
        } else {
            // If the variation is a duplicate, break to avoid infinite loop
            console.log('Variation is duplicate, stopping generation');
            break;
        }
    }
    
    console.log(`Final prompts count: ${prompts.length}`);
    return prompts.slice(0, expectedCount);
}

// Helper function to create creative variations of prompts
function createPromptVariation(basePrompt, index) {
    const creativeVariations = [
        `ARTISTIC VARIATION ${index}: Replace the person's current clothing with the uploaded clothing items, maintaining their face and body unchanged. Apply dramatic artistic lighting with creative shadows and rim lighting effects. Position the person in a dynamic pose with emotional expression against an artistic background with depth and texture. Use advanced composition techniques including rule of thirds and creative depth of field for maximum visual impact.`,
        `CREATIVE MASTERPIECE ${index}: Remove the person's current clothing and dress them in the uploaded clothing items, keeping their face and body appearance the same. Create a visually stunning composition with artistic lighting, creative pose variations, and dramatic background elements. Apply mood and atmosphere through sophisticated color grading and artistic ambiance for a truly artistic result.`,
        `VISUAL ARTWORK ${index}: Transform the person's clothing to the uploaded items while preserving their facial features and body structure. Craft an artistic visual experience with creative lighting setups, dynamic pose expressions, and artistic background transformations. Incorporate advanced photography techniques including selective focus, artistic bokeh, and creative composition for a masterpiece result.`,
        `ARTISTIC ENHANCEMENT ${index}: Replace the person's current clothing with the uploaded clothing items, maintaining their face and body unchanged. Create an artistic visual narrative with dramatic lighting, creative shadow play, and sophisticated composition. Apply color theory principles and artistic depth of field effects for a creatively enhanced, visually stunning image.`,
        `CINEMATIC TRANSFORMATION ${index}: Replace the person's current clothing with the uploaded clothing items while preserving their face and body exactly. Create a cinematic masterpiece with dramatic film lighting, atmospheric effects, and storytelling composition. Use advanced cinematography techniques including depth of field, creative framing, and mood lighting for a movie-quality result.`,
        `FASHION EDITORIAL ${index}: Transform the person's clothing to the uploaded items, keeping their face and body unchanged. Create a high-fashion editorial scene with dramatic studio lighting, artistic poses, and sophisticated composition. Apply fashion photography techniques including creative lighting, artistic shadows, and professional styling for a magazine-quality result.`,
        `STREET ART MASTERPIECE ${index}: Replace the person's current clothing with the uploaded clothing items while maintaining their face and body. Create a vibrant street photography scene with urban graffiti backgrounds, dynamic poses, and authentic street aesthetics. Use creative urban lighting, candid photography techniques, and artistic street elements for a dynamic result.`,
        `VINTAGE GLAMOUR ${index}: Transform the person's clothing to the uploaded items, preserving their face and body exactly. Create a nostalgic vintage scene with period-appropriate styling, artistic film grain effects, and classic photography techniques. Apply vintage color grading, retro aesthetics, and timeless composition for a nostalgic masterpiece.`,
        `MINIMALIST ELEGANCE ${index}: Replace the person's current clothing with the uploaded clothing items while keeping their face and body unchanged. Create a clean, minimalist composition with sophisticated negative space, artistic simplicity, and maximum visual impact. Use creative minimalism, elegant lighting, and sophisticated composition for a refined result.`,
        `PROFESSIONAL SOPHISTICATION ${index}: Transform the person's clothing to the uploaded items, maintaining their face and body exactly. Create a professional corporate scene with sophisticated business aesthetics, polished lighting, and executive photography techniques. Apply corporate styling, professional composition, and refined business aesthetics for a polished result.`
    ];
    
    return creativeVariations[index % creativeVariations.length];
}

// Analyze user photo endpoint
app.post('/api/analyze-user-photo', async (req, res) => {
    try {
        const { userImage } = req.body;

        if (!userImage) {
            return res.status(400).json({ 
                success: false, 
                error: 'No user image provided' 
            });
        }

        console.log('Analyzing user photo');

        // Create analysis prompt
        const analysisPrompt = `Analyze the provided user photo and provide detailed descriptions of the person. Describe:

1. Physical appearance (age, gender, ethnicity if visible)
2. Facial features (hair color, hair style, facial hair, eye color if visible)
3. Body type and build (height, build, posture)
4. Current clothing and style
5. Skin tone and complexion
6. Any distinctive features or characteristics
7. Overall appearance and style

Please provide a clear, structured analysis of the person in the photo.`;

        // Prepare messages array with user image
        const messages = [
            { role: "system", content: "You are a fashion expert who analyzes people's appearance in detail. Provide clear, structured descriptions of physical characteristics." },
            { role: "user", content: [
                { type: "text", text: analysisPrompt },
                {
                    type: "image_url",
                    image_url: {
                        url: userImage
                    }
                }
            ]}
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 800,
            temperature: 0.7,
        });

        const analysisText = completion.choices[0].message.content.trim();
        
        console.log('User photo analysis completed');

        res.json({
            success: true,
            analysis: analysisText
        });

    } catch (error) {
        console.error('Error analyzing user photo:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to analyze user photo' 
        });
    }
});

// Analyze clothing images endpoint
app.post('/api/analyze-clothing', async (req, res) => {
    try {
        const { clothingImages } = req.body;

        if (!clothingImages || clothingImages.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No clothing images provided' 
            });
        }

        console.log(`Analyzing ${clothingImages.length} clothing item(s)`);

        // Create analysis prompt
        const analysisPrompt = `Analyze the provided clothing images and provide detailed descriptions of each item. For each clothing item, describe:

1. Type of clothing (shirt, dress, jacket, shoes, jewelry, accessories, etc.)
2. Style and aesthetic (casual, formal, vintage, modern, streetwear, etc.)
3. Colors and patterns (solid colors, stripes, floral, geometric, etc.)
4. Material/texture appearance (cotton, leather, silk, denim, etc.)
5. Any distinctive features or accessories (buttons, zippers, logos, etc.)
6. Fit and silhouette (loose, fitted, oversized, etc.)

Please provide a clear, structured analysis for each clothing item.`;

        // Prepare messages array with clothing images
        const messages = [
            { role: "system", content: "You are a fashion expert who analyzes clothing items in detail. Provide clear, structured descriptions of clothing characteristics." },
            { role: "user", content: analysisPrompt }
        ];

        // Add clothing images to the user message
        const imageContent = [{ type: "text", text: analysisPrompt }];
        clothingImages.forEach((clothingImage, index) => {
            imageContent.push({
                type: "image_url",
                image_url: {
                    url: clothingImage
                }
            });
        });
        messages[1].content = imageContent;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7,
        });

        const analysisText = completion.choices[0].message.content.trim();
        
        console.log('Clothing analysis completed');

        res.json({
            success: true,
            analysis: analysisText,
            clothingCount: clothingImages.length
        });

    } catch (error) {
        console.error('Error analyzing clothing:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to analyze clothing images' 
        });
    }
});

// Generate try-on image endpoint
app.post('/api/generate-try-on', validateTryOnRequest, async (req, res) => {
    try {
        const { prompts, image_urls, image_count = 1, user_image } = req.body;
        
        if (!prompts || !image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
            return res.status(400).json({ 
                error: 'Missing required fields: prompts and image_urls array' 
            });
        }

        // Validate image count (1-5 images)
        const numImages = Math.min(Math.max(parseInt(image_count) || 1, 1), 5);
        
        // Ensure we have the right number of prompts
        const promptArray = Array.isArray(prompts) ? prompts : [prompts];
        const finalPrompts = promptArray.slice(0, numImages);

        // Combine user image with clothing images
        const allImageUrls = [];
        if (user_image) {
            allImageUrls.push(user_image);
        }
        allImageUrls.push(...image_urls);

        console.log('Generating try-on images with prompts:', finalPrompts.length);
        console.log('Number of images to generate:', numImages);
        console.log('User image provided:', !!user_image);
        console.log('Total image URLs:', allImageUrls.length);

        // Generate images with different prompts
        const results = [];
        
        for (let i = 0; i < numImages; i++) {
            const prompt = finalPrompts[i] || finalPrompts[0]; // Fallback to first prompt
            
            console.log(`Generating image ${i + 1} with prompt:`, prompt.substring(0, 100) + '...');
            
            // Call Replicate API for each image
            const result = await replicate.run("google/nano-banana", {
                input: {
                    prompt: prompt,
                    image_input: allImageUrls
                }
            });

            console.log(`Image ${i + 1} generation completed`);
            console.log(`Image ${i + 1} result:`, result);
            
            // Format result to match expected structure
            const formattedResult = {
                data: {
                    images: [{
                        url: result.url ? result.url() : result
                    }]
                },
                requestId: `replicate_${Date.now()}_${i}`
            };
            
            results.push(formattedResult);
        }

        // Combine all results
        const combinedData = {
            images: [],
            requestIds: []
        };
        
        results.forEach((result, index) => {
            if (result.data && result.data.images) {
                combinedData.images.push(...result.data.images);
            }
            combinedData.requestIds.push(result.requestId);
        });
        
        console.log('Combined data:', JSON.stringify(combinedData, null, 2));
        
        const response = {
            success: true,
            data: combinedData,
            requestIds: combinedData.requestIds
        };
        
        console.log('Final response:', JSON.stringify(response, null, 2));
        
        res.json(response);

    } catch (error) {
        console.error('Error generating try-on image:', error);
        
        // Handle specific Replicate errors
        if (error.message.includes('API key') || error.message.includes('authentication')) {
            return res.status(401).json({ 
                error: 'Invalid API key. Please check your REPLICATE_API_TOKEN environment variable.' 
            });
        }
        
        if (error.message.includes('rate limit')) {
            return res.status(429).json({ 
                error: 'Rate limit exceeded. Please try again later.' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to generate image. Please try again.',
            details: error.message 
        });
    }
});

// Upload images endpoint (alternative to data URLs)
app.post('/api/upload-images', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        const imageUrls = req.files.map(file => {
            return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
        });

        res.json({
            success: true,
            imageUrls: imageUrls
        });

    } catch (error) {
        console.error('Error uploading images:', error);
        res.status(500).json({ 
            error: 'Failed to upload images',
            details: error.message 
        });
    }
});

// Serve uploaded images
app.use('/uploads', express.static('uploads'));

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File too large. Maximum size is 10MB.' 
            });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to set your REPLICATE_API_TOKEN environment variable');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});

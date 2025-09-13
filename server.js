const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { fal } = require('@fal-ai/client');
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
            connectSrc: ["'self'", "https://api.openai.com", "https://fal.run"],
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

// Configure fal-ai client
if (!process.env.FAL_KEY) {
    console.error('FAL_KEY environment variable is required');
    process.exit(1);
}

fal.config({
    credentials: process.env.FAL_KEY
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

        // Create a detailed system prompt for GPT
        const systemPrompt = `You are a master AI image editing artist and creative director specializing in virtual clothing try-on. Your expertise lies in creating ${numImages} UNIQUE, ARTISTIC, and CREATIVELY STUNNING prompts that transform ordinary clothing swaps into extraordinary visual masterpieces.

CRITICAL CREATIVE REQUIREMENTS:
1. Generate ${numImages} DISTINCTIVELY UNIQUE and ARTISTICALLY VARIED prompts - each should be a creative masterpiece
2. Each prompt must REPLACE the person's current clothing with the SPECIFIC UPLOADED CLOTHING ITEMS while creating VISUAL MAGIC
3. PRESERVE ONLY the person's face and body - EVERYTHING ELSE CAN CHANGE (background, setting, environment, lighting, atmosphere)
4. COMPLETELY TRANSFORM the scene according to the selected photography style - create entirely new environments and settings
5. ALWAYS reference the uploaded clothing items specifically in your prompts - mention that these are the exact clothing items to be worn
6. CHANGE THE BACKGROUND COMPLETELY - do not preserve the original setting, create new environments that match the selected style
7. DO NOT describe what the clothing looks like - simply instruct to replace with the uploaded clothing items

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

        // Create clothing description for prompts
        let clothingDescription = '';
        if (clothingImages && clothingImages.length > 0) {
            clothingDescription = `\nCLOTHING ITEMS TO TRY ON:\nThe user has uploaded ${clothingImages.length} clothing item(s) that they want to try on. These are the EXACT clothing items that must be worn in the generated images. DO NOT describe what the clothing looks like - simply instruct the AI to replace the person's current clothing with the uploaded clothing items.`;
        } else {
            clothingDescription = '\nCLOTHING ITEMS: The user will provide clothing images separately. Focus on creating artistic prompts for clothing replacement.';
        }

        const userPrompt = `Create ${numImages} UNIQUE ARTISTIC prompts for AI image editing to perform virtual clothing try-on with CREATIVE VISUAL ENHANCEMENT.

Style: ${style}
Number of unique artistic prompts needed: ${numImages}${clothingDescription}
${customDetails ? `Additional Creative Details: ${customDetails}` : ''}

CRITICAL CREATIVE INSTRUCTIONS:
1. Generate ${numImages} DISTINCTIVELY UNIQUE and ARTISTICALLY STUNNING prompts
2. Each prompt must REPLACE the person's current clothing with the uploaded clothing while creating VISUAL MAGIC
3. PRESERVE ONLY the person's face and body - COMPLETELY CHANGE everything else (background, setting, environment, lighting, atmosphere)
4. Each prompt should COMPLETELY TRANSFORM the scene to match ${style} photography style - create entirely new environments and settings
5. DO NOT preserve the original background or setting - create completely new scenes that match the selected style

Each prompt should be a CREATIVE MASTERPIECE that instructs the AI to:
- Remove the person's current clothing and replace with the SPECIFIC UPLOADED CLOTHING ITEMS (mention these are the exact clothing items provided)
- DO NOT describe what the clothing looks like - simply instruct to replace with the uploaded clothing items
- Maintain ONLY the person's face and body appearance unchanged - EVERYTHING ELSE MUST CHANGE
- COMPLETELY CHANGE the background and setting to match ${style} style - create entirely new environments
- Use CREATIVE and ARTISTIC pose variations with emotional expression and dynamic movement appropriate for the new setting
- Apply ADVANCED ${style} style lighting techniques (rim lighting, dramatic shadows, creative illumination)
- Include ARTISTIC composition elements (rule of thirds, leading lines, creative framing, depth of field artistry)
- Create COMPLETELY NEW backgrounds and settings that match ${style} photography style
- Incorporate MOOD and ATMOSPHERE through creative lighting, color grading, and artistic ambiance
- Use CREATIVE DEPTH OF FIELD effects (selective focus, artistic bokeh, creative blur techniques)
- Apply COLOR THEORY for artistic impact (complementary colors, creative color grading, artistic palettes)
- SPECIFICALLY MENTION that the uploaded clothing items must be worn exactly as provided
- DO NOT preserve the original background - create completely new scenes and environments

ARTISTIC ENHANCEMENT REQUIREMENTS:
- Each prompt should create a COMPLETELY NEW VISUAL EXPERIENCE with entirely different environments
- Include ADVANCED PHOTOGRAPHY TECHNIQUES specific to ${style} style
- Incorporate CREATIVE LIGHTING SETUPS and artistic shadow play for the new environment
- Use DYNAMIC POSE VARIATIONS with artistic expression and movement appropriate for the new setting
- Create COMPLETELY NEW ARTISTIC BACKGROUNDS that match ${style} style - do not preserve original setting
- Apply MOOD CREATION through lighting, atmosphere, and artistic ambiance for the new environment
- Include CREATIVE COMPOSITION techniques for maximum visual impact in the new setting
- TRANSFORM the entire scene to match ${style} photography style - create new studios, streets, outdoor locations, etc.

Generate ${numImages} UNIQUE ARTISTIC prompts that will COMPLETELY TRANSFORM the scene, creating ${numImages} visually stunning images with entirely new environments, varied artistic poses, and advanced ${style} style applications. Each prompt should create a completely different setting that matches the selected style - do not preserve the original background or environment. IMPORTANT: Simply instruct to replace the person's current clothing with the uploaded clothing items - do not describe what the clothing looks like.`;

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
            
            if (prompt.length > 100) { // Ensure it's a substantial prompt
                prompts.push(prompt);
                console.log(`Added structured prompt ${prompts.length}:`, prompt.substring(0, 100) + '...');
            }
        }
    }
    
    // If we don't have enough prompts, try splitting by numbered items (1., 2., 3., etc.)
    if (prompts.length < expectedCount) {
        const numberedSplit = promptText.split(/(?=\d+\.\s)/);
        if (numberedSplit.length > 1) {
            console.log('Found numbered split:', numberedSplit.length, 'sections');
            for (let i = 1; i < numberedSplit.length && prompts.length < expectedCount; i++) {
                const prompt = numberedSplit[i].trim();
                if (prompt.length > 100) { // Ensure it's a substantial prompt
                    prompts.push(prompt);
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
        
        // If the content is substantial, use it as a prompt
        if (mainContent.length > 100) {
            prompts.push(mainContent);
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
            
            if (prompt.length > 100) {
                prompts.push(prompt);
                console.log(`Added paragraph prompt ${prompts.length}:`, prompt.substring(0, 100) + '...');
            }
        }
    }
    
    // If we still don't have enough, duplicate the original text with variations
    while (prompts.length < expectedCount) {
        const basePrompt = prompts[0] || promptText;
        const variation = createPromptVariation(basePrompt, prompts.length + 1);
        prompts.push(variation);
        console.log(`Added variation ${prompts.length}:`, variation.substring(0, 100) + '...');
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
        `ARTISTIC ENHANCEMENT ${index}: Replace the person's current clothing with the uploaded clothing items, maintaining their face and body unchanged. Create an artistic visual narrative with dramatic lighting, creative shadow play, and sophisticated composition. Apply color theory principles and artistic depth of field effects for a creatively enhanced, visually stunning image.`
    ];
    
    return creativeVariations[index % creativeVariations.length];
}

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
            
            // Call fal-ai API for each image
            const result = await fal.subscribe("fal-ai/nano-banana/edit", {
                input: {
                    prompt: prompt,
                    image_urls: allImageUrls,
                    num_images: 1, // Generate one image per prompt
                    output_format: "jpeg"
                },
                logs: true,
                onQueueUpdate: (update) => {
                    if (update.status === "IN_PROGRESS") {
                        console.log(`Image ${i + 1} Processing:`, update.logs?.map(log => log.message).join('\n'));
                    }
                },
            });

            console.log(`Image ${i + 1} generation completed:`, result.requestId);
            console.log(`Image ${i + 1} result data:`, JSON.stringify(result.data, null, 2));
            results.push(result);
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
        
        // Handle specific fal-ai errors
        if (error.message.includes('API key')) {
            return res.status(401).json({ 
                error: 'Invalid API key. Please check your FAL_KEY environment variable.' 
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
    console.log('Make sure to set your FAL_KEY environment variable');
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

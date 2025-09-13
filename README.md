# TryOnAI - Virtual Clothing Try-On

A stunning, modern web application that allows users to virtually try on clothing using AI-powered image editing. Built with a beautiful dark theme, glassmorphism effects, and professional SaaS design.

![TryOnAI Preview](https://via.placeholder.com/800x400/8b5cf6/ffffff?text=TryOnAI+Virtual+Try-On)

## ✨ Features

- **🎨 Modern Design**: Beautiful dark theme with purple/pink gradients and glassmorphism effects
- **📸 User Photo Upload**: Drag & drop or click to upload your photo
- **👕 Clothing Images**: Upload clothing images or paste URLs from any website
- **🎭 Style Selection**: Choose from 6 professional styles (Realistic, Fashion, Casual, Artistic, Vintage, Modern)
- **🤖 GPT-Powered Prompts**: OpenAI GPT-4o-mini analyzes your photo and generates personalized prompts
- **🖼️ Multiple Images**: Generate 1-4 unique variations of your try-on
- **💾 Download Results**: Save individual images or download all at once
- **📱 Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **🔒 Secure**: API keys protected, rate limiting, input validation, and security headers

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/tryonai.git
cd tryonai
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your actual API keys:

```env
# Required API Keys
FAL_KEY=your_fal_ai_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Optional: Production Settings
# CORS_ORIGIN=https://yourdomain.com
# RATE_LIMIT_WINDOW_MS=900000
# RATE_LIMIT_MAX_REQUESTS=100
```

**Get your API keys:**
- **fal-ai**: [fal.ai Dashboard](https://fal.ai/dashboard) - Free tier available
- **OpenAI**: [OpenAI Platform](https://platform.openai.com/api-keys) - Pay-per-use

### 4. Start the Application

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

### 5. Open in Browser

Visit `http://localhost:3000` to see your TryOnAI application!

## 🎯 How to Use

1. **📸 Upload Your Photo**: 
   - Drag & drop your photo or click to browse
   - Or paste a photo URL
   - Use a clear, well-lit photo for best results

2. **👕 Add Clothing Items**:
   - Upload clothing images from your device
   - Or paste image URLs from any website
   - Add multiple clothing items for variety

3. **🎨 Choose Style**:
   - Select from 6 professional styles
   - Each style creates a different mood and setting

4. **⚙️ Customize** (Optional):
   - Add custom prompts for specific poses or settings
   - Choose how many images to generate (1-4)

5. **✨ Generate**:
   - Click "Generate Virtual Try-On"
   - Watch the AI create your personalized images

6. **💾 Download**:
   - Download individual images
   - Or download all images at once

## 🛡️ Security Features

This application is production-ready with comprehensive security measures:

- **🔐 API Key Protection**: All API keys stored server-side only
- **🛡️ Security Headers**: Helmet.js for security headers
- **⏱️ Rate Limiting**: Prevents abuse with configurable limits
- **✅ Input Validation**: Validates all user inputs
- **🚫 CORS Protection**: Configurable cross-origin resource sharing
- **📝 Error Handling**: Secure error messages without sensitive data
- **🔍 Content Security Policy**: Prevents XSS attacks

## 🏗️ Architecture

### Frontend
- **HTML5**: Semantic markup with accessibility features
- **CSS3**: Modern styling with CSS Grid, Flexbox, and custom properties
- **JavaScript**: Vanilla ES6+ with modern APIs (Fetch, FileReader, etc.)
- **Responsive Design**: Mobile-first approach with breakpoints

### Backend
- **Node.js**: Server runtime
- **Express.js**: Web framework with middleware
- **Security Middleware**: Helmet, rate limiting, CORS
- **File Handling**: Multer for secure file uploads
- **Error Handling**: Comprehensive error management

### AI Services
- **fal-ai/nano-banana/edit**: High-quality image editing API
- **OpenAI GPT-4o-mini**: Intelligent prompt generation with vision
- **Image Analysis**: AI analyzes user photos for personalized results

## 📁 Project Structure

```
tryonai/
├── 📄 index.html              # Main application page
├── 🎨 styles.css              # Modern CSS with dark theme
├── ⚡ script.js               # Frontend JavaScript
├── 🖥️ server.js               # Express server with security
├── 📦 package.json            # Dependencies and scripts
├── 🔒 .env.example            # Environment variables template
├── 🚫 .gitignore              # Git ignore rules
├── 📖 README.md               # This documentation
└── 📁 uploads/                # Temporary file storage (auto-created)
```

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Deployment Platforms

**Vercel** (Recommended):
```bash
npm install -g vercel
vercel
```

**Heroku**:
```bash
git add .
git commit -m "Deploy to Heroku"
git push heroku main
```

**Railway**:
```bash
railway login
railway init
railway up
```

**DigitalOcean App Platform**:
- Connect your GitHub repository
- Set environment variables in the dashboard
- Deploy automatically

## 🔧 Configuration

### Rate Limiting
Configure rate limiting in your `.env` file:

```env
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100    # 100 requests per window
```

### CORS Settings
For production, set your domain:

```env
CORS_ORIGIN=https://yourdomain.com
```

## 🐛 Troubleshooting

### Common Issues

**❌ "Invalid API key" error**
- ✅ Check your `.env` file has the correct `FAL_KEY`
- ✅ Verify your API key is active at [fal.ai Dashboard](https://fal.ai/dashboard)

**❌ "Rate limit exceeded" error**
- ✅ Wait a few minutes before trying again
- ✅ Consider upgrading your fal-ai plan for higher limits

**❌ Images not uploading**
- ✅ Check file size (max 20MB)
- ✅ Ensure files are valid image formats (JPG, PNG, WEBP)

**❌ Generation fails**
- ✅ Try with different images
- ✅ Ensure your photo is clear and well-lit
- ✅ Check that clothing images are clear and visible

**❌ Server won't start**
- ✅ Run `npm install` to install dependencies
- ✅ Check that your `.env` file exists and has valid API keys
- ✅ Ensure port 3000 is available

### Development

For development with auto-restart:
```bash
npm run dev
```

The server will automatically restart when you make changes to the code.

## 📊 API Usage

### fal-ai API
- **Model**: `fal-ai/nano-banana/edit`
- **Cost**: Pay-per-use pricing
- **Limits**: Based on your fal-ai plan
- **Quality**: High-resolution image editing

### OpenAI API
- **Model**: `gpt-4o-mini`
- **Cost**: Pay-per-token pricing
- **Features**: Vision capabilities for image analysis
- **Usage**: Prompt generation and customization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [fal-ai](https://fal.ai/) for the powerful image editing API
- [OpenAI](https://openai.com/) for GPT-4o-mini
- [Express.js](https://expressjs.com/) for the web framework
- [Helmet.js](https://helmetjs.github.io/) for security headers

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Search existing [Issues](https://github.com/yourusername/tryonai/issues)
3. Create a new issue with detailed information
4. Include your environment details and error messages

---

**Made with ❤️ for the AI community**
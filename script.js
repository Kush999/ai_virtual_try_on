// Global variables
let userImageFile = null;
let userImageData = null;
let clothingImages = [];
let clothingFiles = [];
let generatedImageUrls = [];
let generatedVideoUrls = [];

// DOM elements
const userImageInput = document.getElementById('userImageInput');
const userImageUrl = document.getElementById('userImageUrl');
const userUploadArea = document.getElementById('userUploadArea');
const userImagePreview = document.getElementById('userImagePreview');
const userPreviewImg = document.getElementById('userPreviewImg');
const removeUserImage = document.getElementById('removeUserImage');

const clothingImageInput = document.getElementById('clothingImageInput');
const clothingImageUrl = document.getElementById('clothingImageUrl');
const clothingUploadArea = document.getElementById('clothingUploadArea');
const clothingPreviews = document.getElementById('clothingPreviews');

const styleOptions = document.querySelectorAll('.style-option');
const customPrompt = document.getElementById('customPrompt');
const imageCountBtns = document.querySelectorAll('.count-btn');
const imageCountValue = document.getElementById('imageCountValue');

const tryOnBtn = document.getElementById('tryOnBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const resultsSection = document.getElementById('resultsSection');
const promptDisplay = document.getElementById('promptDisplay');
const togglePromptBtn = document.getElementById('togglePromptBtn');
const promptContent = document.getElementById('promptContent');
const promptText = document.getElementById('promptText');
const copyPromptBtn = document.getElementById('copyPromptBtn');
const resultImages = document.getElementById('resultImages');
const resultVideos = document.getElementById('resultVideos');
const videosGrid = document.getElementById('videosGrid');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const downloadAllVideosBtn = document.getElementById('downloadAllVideosBtn');
const generateVideoToggle = document.getElementById('generateVideoToggle');
const videoPromptSection = document.getElementById('videoPromptSection');
const videoPrompt = document.getElementById('videoPrompt');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    console.log('TryOn button element:', tryOnBtn);
    console.log('TryOn button exists:', !!tryOnBtn);
    console.log('TryOn button type:', typeof tryOnBtn);
    console.log('TryOn button tagName:', tryOnBtn ? tryOnBtn.tagName : 'N/A');
    
    if (tryOnBtn) {
        console.log('TryOn button found, adding event listener...');
        console.log('Button text content:', tryOnBtn.textContent);
        console.log('Button classes:', tryOnBtn.className);
    } else {
        console.error('TryOn button NOT found!');
        // Try to find it manually
        const manualBtn = document.getElementById('tryOnBtn');
        console.log('Manual search result:', manualBtn);
    }
    
    try {
        initializeEventListeners();
        updateTryOnButton();
        addScrollAnimations();
        console.log('All initialization completed successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

function initializeEventListeners() {
    // User image upload
    userUploadArea.addEventListener('click', () => userImageInput.click());
    userImageInput.addEventListener('change', handleUserImageUpload);
    userImageUrl.addEventListener('input', handleUserImageUrlInput);
    removeUserImage.addEventListener('click', removeUserImagePreview);
    
    // Clothing image upload
    clothingUploadArea.addEventListener('click', () => clothingImageInput.click());
    clothingImageInput.addEventListener('change', handleClothingFileUpload);
    clothingImageUrl.addEventListener('input', handleClothingUrlInput);
    
    // Style selection
    styleOptions.forEach(option => {
        option.addEventListener('click', () => selectStyle(option));
    });
    
    // Image count selection
    imageCountBtns.forEach(btn => {
        btn.addEventListener('click', () => selectImageCount(btn));
    });
    
    // Generate button
    if (tryOnBtn) {
        console.log('Adding click event listener to tryOnBtn...');
        tryOnBtn.addEventListener('click', function(event) {
            console.log('TryOn button clicked!', event);
            event.preventDefault();
            generateTryOnImage();
        });
        
        // Also add a simple test click handler
        tryOnBtn.addEventListener('click', function() {
            console.log('Secondary click handler triggered');
        });
        
        console.log('Event listeners added successfully');
    } else {
        console.error('Cannot add event listener to tryOnBtn - element not found');
    }
    
    // Prompt display
    togglePromptBtn.addEventListener('click', togglePromptDisplay);
    copyPromptBtn.addEventListener('click', copyPrompt);
    
    // Download
    downloadAllBtn.addEventListener('click', downloadAllImages);
    downloadAllVideosBtn.addEventListener('click', downloadAllVideos);
    
    // Video generation toggle
    generateVideoToggle.addEventListener('change', toggleVideoGeneration);
    
    // Drag and drop
    setupDragAndDrop();
}

// User Image Handling
function handleUserImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        console.log('User image file uploaded:', file.name, file.type);
        userImageFile = file;
        displayUserImagePreview(file);
        updateTryOnButton();
    }
}

function handleUserImageUrlInput(event) {
    const url = event.target.value.trim();
    if (url && isValidUrl(url)) {
        console.log('User image URL added:', url);
        addUserImageFromUrl(url);
        updateTryOnButton();
    }
}

function addUserImageFromUrl(url) {
    userImageData = url;
    displayUserImagePreview(null, url);
}

function displayUserImagePreview(file, url = null) {
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            userPreviewImg.src = e.target.result;
            userImagePreview.style.display = 'block';
            userUploadArea.style.display = 'none';
        };
        reader.readAsDataURL(file);
    } else if (url) {
        userPreviewImg.src = url;
        userImagePreview.style.display = 'block';
        userUploadArea.style.display = 'none';
    }
}

function removeUserImagePreview() {
    userImageFile = null;
    userImageData = null;
    userImagePreview.style.display = 'none';
    userUploadArea.style.display = 'block';
    userImageInput.value = '';
    userImageUrl.value = '';
    updateTryOnButton();
}

// Clothing Image Handling
function handleClothingFileUpload(event) {
    const files = Array.from(event.target.files);
    console.log('Clothing files uploaded:', files.length, 'files');
    files.forEach(file => {
        if (file && !clothingFiles.includes(file)) {
            console.log('Adding clothing file:', file.name, file.type);
            clothingFiles.push(file);
            addClothingImageFromFile(file);
        }
    });
    // Remove updateTryOnButton() from here - it will be called after FileReader completes
}

function handleClothingUrlInput(event) {
    const url = event.target.value.trim();
    if (url && isValidUrl(url) && !clothingImages.includes(url)) {
        console.log('Clothing image URL added:', url);
        addClothingImageFromUrl(url);
        event.target.value = '';
        updateTryOnButton();
    }
}

function addClothingImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageData = e.target.result;
        console.log('Clothing image data added, total clothing images:', clothingImages.length + 1);
        clothingImages.push(imageData);
        updateClothingPreviews();
        updateTryOnButton(); // Move updateTryOnButton() here - after the image data is added
    };
    reader.readAsDataURL(file);
}

function addClothingImageFromUrl(url) {
    console.log('Adding clothing URL, total clothing images:', clothingImages.length + 1);
    clothingImages.push(url);
    updateClothingPreviews();
}

function updateClothingPreviews() {
    clothingPreviews.innerHTML = '';
    clothingImages.forEach((imageData, index) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'clothing-preview-item';
        previewItem.innerHTML = `
            <img src="${imageData}" alt="Clothing preview">
            <button class="remove-btn" data-clothing-index="${index}">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Add event listener for remove button
        const removeBtn = previewItem.querySelector('.remove-btn');
        removeBtn.addEventListener('click', () => {
            const clothingIndex = parseInt(removeBtn.getAttribute('data-clothing-index'));
            removeClothingImage(clothingIndex);
        });
        clothingPreviews.appendChild(previewItem);
    });
}

// Make removeClothingImage global so it can be called from onclick
window.removeClothingImage = function(index) {
    console.log('Removing clothing image at index:', index);
    console.log('Before removal - clothingImages length:', clothingImages.length);
    console.log('Before removal - clothingFiles length:', clothingFiles.length);
    
    if (index >= 0 && index < clothingImages.length) {
        clothingImages.splice(index, 1);
        clothingFiles.splice(index, 1);
        console.log('After removal - clothingImages length:', clothingImages.length);
        console.log('After removal - clothingFiles length:', clothingFiles.length);
        updateClothingPreviews();
        updateTryOnButton();
    } else {
        console.error('Invalid index for clothing removal:', index);
    }
};

// Style Selection
function selectStyle(selectedOption) {
    styleOptions.forEach(option => option.classList.remove('active'));
    selectedOption.classList.add('active');
}

function getSelectedStyle() {
    const activeOption = document.querySelector('.style-option.active');
    return activeOption ? activeOption.dataset.style : 'realistic';
}

// Image Count Selection
function selectImageCount(selectedBtn) {
    imageCountBtns.forEach(btn => btn.classList.remove('active'));
    selectedBtn.classList.add('active');
    imageCountValue.textContent = selectedBtn.dataset.count;
}

function getSelectedImageCount() {
    const activeBtn = document.querySelector('.count-btn.active');
    return activeBtn ? parseInt(activeBtn.dataset.count) : 2;
}

// Drag and Drop
function setupDragAndDrop() {
    // User image drag and drop
    userUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        userUploadArea.style.borderColor = 'var(--primary-purple)';
        userUploadArea.style.backgroundColor = 'var(--bg-card-hover)';
    });
    
    userUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        userUploadArea.style.borderColor = 'var(--border-primary)';
        userUploadArea.style.backgroundColor = 'var(--bg-card)';
    });
    
    userUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        userUploadArea.style.borderColor = 'var(--border-primary)';
        userUploadArea.style.backgroundColor = 'var(--bg-card)';
        
        const files = Array.from(e.dataTransfer.files);
        const imageFile = files.find(file => file.type.startsWith('image/'));
        if (imageFile) {
            userImageFile = imageFile;
            displayUserImagePreview(imageFile);
            updateTryOnButton();
        }
    });
    
    // Clothing image drag and drop
    clothingUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        clothingUploadArea.style.borderColor = 'var(--primary-purple)';
        clothingUploadArea.style.backgroundColor = 'var(--bg-card-hover)';
    });
    
    clothingUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        clothingUploadArea.style.borderColor = 'var(--border-primary)';
        clothingUploadArea.style.backgroundColor = 'var(--bg-card)';
    });
    
    clothingUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        clothingUploadArea.style.borderColor = 'var(--border-primary)';
        clothingUploadArea.style.backgroundColor = 'var(--bg-card)';
        
        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        imageFiles.forEach(file => {
            if (!clothingFiles.includes(file)) {
                clothingFiles.push(file);
                addClothingImageFromFile(file);
            }
        });
        // Remove updateTryOnButton() from here - it will be called after FileReader completes
    });
}

// Utility Functions
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function updateTryOnButton() {
    const hasUserImage = userImageFile || userImageData;
    const hasClothingImages = clothingImages.length > 0;
    
    console.log('Updating TryOn button state:');
    console.log('- hasUserImage:', hasUserImage);
    console.log('- hasClothingImages:', hasClothingImages);
    console.log('- userImageFile:', userImageFile);
    console.log('- userImageData:', userImageData);
    console.log('- clothingImages.length:', clothingImages.length);
    
    if (hasUserImage && hasClothingImages) {
        tryOnBtn.disabled = false;
        tryOnBtn.style.opacity = '1';
        console.log('Button ENABLED');
    } else {
        tryOnBtn.disabled = true;
        tryOnBtn.style.opacity = '0.6';
        console.log('Button DISABLED');
    }
}

// Main Generation Function
async function generateTryOnImage() {
    if (!userImageFile && !userImageData) {
        alert('Please upload your photo first');
        return;
    }
    
    if (clothingImages.length === 0) {
        alert('Please upload at least one clothing item');
        return;
    }
    
    try {
        // Show loading
        showLoading();
        
        // Prepare data
        const userImageDataToSend = userImageFile ? await fileToDataURL(userImageFile) : userImageData;
        const style = getSelectedStyle();
        const imageCount = getSelectedImageCount();
        const customPromptText = customPrompt.value.trim();
        const generateVideo = generateVideoToggle.checked;
        const videoPromptText = videoPrompt.value.trim();
        
        // Generate prompts
        const prompts = await createPrompts(userImageDataToSend, clothingImages, style, imageCount, customPromptText);
        
        // Generate images
        const result = await callFalAI(prompts, clothingImages, imageCount, userImageDataToSend);
        
        // Display results
        displayResult(result, prompts);
        
        // Generate videos if enabled
        if (generateVideo && result.success && result.data.images) {
            await generateVideosFromImages(result.data.images, videoPromptText);
        }
        
    } catch (error) {
        console.error('Error generating image:', error);
        alert('Failed to generate image. Please try again.');
    } finally {
        hideLoading();
    }
}

async function createPrompts(userImageData, clothingImages, style, imageCount, customPromptText) {
    try {
        const response = await fetch('/api/generate-prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userImageData: userImageData,
                clothingImages: clothingImages,
                style: style,
                imageCount: imageCount,
                customPrompt: customPromptText
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate prompts');
        }
        
        const data = await response.json();
        return data.prompts || [];
        
    } catch (error) {
        console.error('Error generating prompts:', error);
        // Fallback prompt
        return [`Replace the person's current clothing with the uploaded clothing items. Create a ${style} style look with professional styling and high-quality appearance.`];
    }
}

async function callFalAI(prompts, imageUrls, imageCount, userImageData) {
    const response = await fetch('/api/generate-try-on', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompts: prompts,
            image_urls: imageUrls,
            image_count: imageCount,
            user_image: userImageData
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to generate image');
    }
    
    return await response.json();
}

function displayResult(result, generatedPrompts) {
    if (!result.success || !result.data.images) {
        throw new Error('Invalid result from API');
    }
    
    // Store generated image URLs
    generatedImageUrls = result.data.images.map(img => img.url);
    
    // Clear previous results
    resultImages.innerHTML = '';
    
    // Display images
    result.data.images.forEach((imageData, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'result-image-item fade-in-up';
        imageItem.style.animationDelay = `${index * 0.1}s`;
        
        imageItem.innerHTML = `
            <img src="${imageData.url}" alt="Generated image ${index + 1}" loading="lazy">
            <div class="image-info">
                <div class="image-number">Image ${index + 1}</div>
                <button class="download-single-btn" data-image-url="${imageData.url}" data-image-number="${index + 1}">
                    <i class="fas fa-download"></i>
                    Download
                </button>
            </div>
        `;
        
        // Add event listener for download button
        const downloadBtn = imageItem.querySelector('.download-single-btn');
        downloadBtn.addEventListener('click', () => {
            const imageUrl = downloadBtn.getAttribute('data-image-url');
            const imageNumber = downloadBtn.getAttribute('data-image-number');
            downloadSingleImage(imageUrl, imageNumber);
        });
        
        resultImages.appendChild(imageItem);
    });
    
    // Display prompts
    if (generatedPrompts && generatedPrompts.length > 0) {
        promptText.textContent = generatedPrompts.join('\n\n---\n\n');
        promptDisplay.style.display = 'block';
    }
    
    // Show results section
    resultsSection.style.display = 'block';
    downloadSection.style.display = 'block';
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Loading Functions
function showLoading() {
    tryOnBtn.classList.add('loading');
    loadingSpinner.style.display = 'block';
    resultsSection.style.display = 'block';
}

function hideLoading() {
    tryOnBtn.classList.remove('loading');
    loadingSpinner.style.display = 'none';
}

// Prompt Display Functions
function togglePromptDisplay() {
    const isShowing = promptContent.classList.contains('show');
    if (isShowing) {
        promptContent.classList.remove('show');
        togglePromptBtn.innerHTML = '<i class="fas fa-eye"></i><span>Show Details</span>';
    } else {
        promptContent.classList.add('show');
        togglePromptBtn.innerHTML = '<i class="fas fa-eye-slash"></i><span>Hide Details</span>';
    }
}

function copyPrompt() {
    const promptTextContent = promptText.textContent;
    if (promptTextContent) {
        navigator.clipboard.writeText(promptTextContent).then(() => {
            copyPromptBtn.innerHTML = '<i class="fas fa-check"></i>Copied!';
            setTimeout(() => {
                copyPromptBtn.innerHTML = '<i class="fas fa-copy"></i>Copy';
            }, 2000);
        });
    }
}

// Download Functions - Make global so it can be called from onclick
window.downloadSingleImage = function(imageUrl, imageNumber) {
    console.log('Downloading single image:', imageUrl, 'Number:', imageNumber);
    console.log('Calling downloadImage function...');
    downloadImage(imageUrl, `try-on-image-${imageNumber}.jpg`);
};

function downloadAllImages() {
    if (generatedImageUrls.length === 0) {
        alert('No images to download');
        return;
    }
    
    generatedImageUrls.forEach((url, index) => {
        setTimeout(() => {
            downloadImage(url, `try-on-image-${index + 1}.jpg`);
        }, index * 500); // Stagger downloads
    });
}

function downloadImage(url, filename) {
    fetch(url)
        .then(response => response.blob())
        .then(blob => {
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
        })
        .catch(error => {
            console.error('Download failed:', error);
            alert('Download failed. Please try again.');
        });
}

// Utility Functions
function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Scroll Animations
function addScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
            }
        });
    }, observerOptions);
    
    // Observe elements
    document.querySelectorAll('.input-card, .feature-card, .style-option').forEach(el => {
        observer.observe(el);
    });
}

// Smooth scrolling for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// FAQ Functionality
function initializeFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all FAQ items
            faqItems.forEach(faqItem => {
                faqItem.classList.remove('active');
            });
            
            // Open clicked item if it wasn't active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
}

// Initialize navigation event listeners
function initializeNavigation() {
    // Logo click handler
    const logo = document.getElementById('logo');
    if (logo) {
        logo.addEventListener('click', () => {
            document.getElementById('home').scrollIntoView({behavior: 'smooth'});
        });
    }
    
    // Start trying on button
    const startBtn = document.getElementById('start-trying-on-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            document.getElementById('try-on').scrollIntoView({behavior: 'smooth'});
        });
    }
}


// Initialize FAQ when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeFAQ();
    initializeNavigation();
});

// Header scroll effect
window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    if (window.scrollY > 100) {
        header.style.background = 'rgba(15, 15, 35, 0.95)';
    } else {
        header.style.background = 'rgba(15, 15, 35, 0.8)';
    }
});

// Video Generation Functions
function toggleVideoGeneration() {
    const isEnabled = generateVideoToggle.checked;
    videoPromptSection.style.display = isEnabled ? 'block' : 'none';
}

async function generateVideosFromImages(images, videoPromptText) {
    if (!images || images.length === 0) {
        console.log('No images available for video generation');
        return;
    }

    console.log('Starting video generation for', images.length, 'images');
    
    // Show video progress section
    showVideoProgress();
    
    // Clear previous videos
    generatedVideoUrls = [];
    videosGrid.innerHTML = '';
    
    // Generate videos for each image
    for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const videoPrompt = videoPromptText || "Rotate the outfit, keep everything else still";
        
        try {
            console.log(`Generating video ${i + 1}/${images.length} for image:`, image.url);
            
            // Show loading state for this video
            showVideoLoading(i + 1, images.length);
            
            // Call video generation API
            const videoResult = await generateVideo(image.url, videoPrompt);
            
            if (videoResult.success) {
                console.log(`Video ${i + 1} generated successfully:`, videoResult.videoUrl);
                generatedVideoUrls.push(videoResult.videoUrl);
                displayVideo(videoResult.videoUrl, i + 1);
            } else {
                console.error(`Failed to generate video ${i + 1}:`, videoResult.error);
                showVideoError(i + 1, videoResult.error);
            }
            
        } catch (error) {
            console.error(`Error generating video ${i + 1}:`, error);
            showVideoError(i + 1, error.message);
        }
    }
    
    // Hide progress and show videos section
    hideVideoProgress();
    if (generatedVideoUrls.length > 0) {
        resultVideos.style.display = 'block';
        downloadAllVideosBtn.style.display = 'inline-flex';
    }
}

async function generateVideo(imageUrl, prompt) {
    const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            imageUrl: imageUrl,
            prompt: prompt
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to generate video');
    }
    
    return await response.json();
}

function showVideoProgress() {
    const progressHtml = `
        <div class="video-progress" id="videoProgress">
            <h4>
                <i class="fas fa-video"></i>
                Generating Videos
            </h4>
            <div class="progress-bar">
                <div class="progress-fill" id="videoProgressFill"></div>
            </div>
            <div class="progress-text" id="videoProgressText">Preparing video generation...</div>
        </div>
    `;
    
    resultVideos.innerHTML = progressHtml;
    resultVideos.style.display = 'block';
}

function showVideoLoading(videoNumber, totalVideos) {
    const progressFill = document.getElementById('videoProgressFill');
    const progressText = document.getElementById('videoProgressText');
    
    if (progressFill && progressText) {
        const progress = (videoNumber / totalVideos) * 100;
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `Generating video ${videoNumber} of ${totalVideos}...`;
    }
}

function hideVideoProgress() {
    const videoProgress = document.getElementById('videoProgress');
    if (videoProgress) {
        videoProgress.remove();
    }
}

function showVideoError(videoNumber, error) {
    const errorHtml = `
        <div class="video-item">
            <div class="video-player">
                <div class="video-loading">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Video ${videoNumber} generation failed</p>
                    <small>${error}</small>
                </div>
            </div>
            <div class="video-info">
                <h4>Video ${videoNumber} - Error</h4>
                <p>Failed to generate video</p>
            </div>
        </div>
    `;
    
    videosGrid.insertAdjacentHTML('beforeend', errorHtml);
}

function displayVideo(videoUrl, videoNumber) {
    const videoHtml = `
        <div class="video-item fade-in-up">
            <div class="video-player">
                <video controls preload="metadata">
                    <source src="${videoUrl}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
            <div class="video-info">
                <h4>Video ${videoNumber}</h4>
                <p>Dynamic video generated from your image</p>
                <div class="video-actions">
                    <button class="video-download-btn" onclick="downloadVideo('${videoUrl}', ${videoNumber})">
                        <i class="fas fa-download"></i>
                        Download Video
                    </button>
                </div>
            </div>
        </div>
    `;
    
    videosGrid.insertAdjacentHTML('beforeend', videoHtml);
}

// Make downloadVideo global so it can be called from onclick
window.downloadVideo = function(videoUrl, videoNumber) {
    console.log('Downloading video:', videoUrl, 'Number:', videoNumber);
    downloadVideoFile(videoUrl, `try-on-video-${videoNumber}.mp4`);
};

function downloadVideoFile(url, filename) {
    fetch(url)
        .then(response => response.blob())
        .then(blob => {
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
        })
        .catch(error => {
            console.error('Video download failed:', error);
            alert('Video download failed. Please try again.');
        });
}

function downloadAllVideos() {
    if (generatedVideoUrls.length === 0) {
        alert('No videos to download');
        return;
    }
    
    generatedVideoUrls.forEach((url, index) => {
        setTimeout(() => {
            downloadVideoFile(url, `try-on-video-${index + 1}.mp4`);
        }, index * 500); // Stagger downloads
    });
}

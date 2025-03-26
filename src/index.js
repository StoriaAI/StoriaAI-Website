const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { ElevenLabsClient } = require('elevenlabs');
const pythonBridge = require('./python_bridge');
const os = require('os');

// Load environment variables from root .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Verify API key is loaded
console.log('Environment:', process.env.NODE_ENV || 'development');
if (process.env.ELEVENLABS_API_KEY) {
  console.log('ElevenLabs API Key loaded successfully');
  console.log('Key length:', process.env.ELEVENLABS_API_KEY.length);
  console.log('Key prefix:', process.env.ELEVENLABS_API_KEY.substring(0, 5) + '***');
} else {
  console.error('ERROR: ELEVENLABS_API_KEY is not set in .env file');
  console.error('Please ensure you have added ELEVENLABS_API_KEY=your_key in the root .env file');
}

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const cacheDuration = process.env.CACHE_DURATION || 3600000; // 1 hour default

// Add production optimizations
if (isProduction) {
  // Enable compression for faster page loads
  if (process.env.ENABLE_COMPRESSION === 'true') {
    const compression = require('compression');
    app.use(compression());
  }
  
  // Set cache headers for static assets
  app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: cacheDuration
  }));
} else {
  // Development mode - no caching
  app.use(express.static(path.join(__dirname, '../public')));
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Add CORS headers for music files
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Simple in-memory cache for API responses
const cache = {
  data: {},
  set: function(key, value, ttl) {
    const now = Date.now();
    this.data[key] = {
      value,
      expiry: now + ttl
    };
  },
  get: function(key) {
    const now = Date.now();
    const item = this.data[key];
    
    if (!item) return null;
    if (now > item.expiry) {
      delete this.data[key];
      return null;
    }
    
    return item.value;
  }
};

// Simple in-memory user store (replace with a database in production)
const users = new Map();
const userFavorites = new Map(); // Store user favorites

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Routes
app.get('/', async (req, res) => {
  res.render('index', { user: req.session.user });
});

// Auth routes
app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/books');
  }
  res.render('login', { error: null });
});

app.get('/signup', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/books');
  }
  res.render('signup', { error: null });
});

app.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.render('signup', { error: 'All fields are required' });
    }

    // Check if user already exists
    if (users.has(email)) {
      return res.render('signup', { error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      id: Date.now().toString(),
      name,
      email,
      password: hashedPassword
    };

    users.set(email, user);

    // Log user in
    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email };

    res.redirect('/books');
  } catch (error) {
    console.error('Signup error:', error);
    res.render('signup', { error: 'Error creating account. Please try again.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.render('login', { error: 'Email and password are required' });
    }

    // Find user
    const user = users.get(email);
    if (!user) {
      return res.render('login', { error: 'Invalid email or password' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: 'Invalid email or password' });
    }

    // Log user in
    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email };

    res.redirect('/books');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Error logging in. Please try again.' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// About route
app.get('/about', (req, res) => {
  res.render('about', { user: req.session.user });
});

// Books listing route
app.get('/books', async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const userFavoriteBooks = userId && userFavorites.has(userId) 
      ? userFavorites.get(userId)
      : new Map();
    
    // Get search parameters from query string
    const searchQuery = req.query.search || '';
    const language = req.query.language || '';
    const sort = req.query.sort || 'popular';
    const topic = req.query.topic || '';
    const page = parseInt(req.query.page) || 1;
    
    // Only use cache if no search parameters are provided and it's the first page
    const useCache = !searchQuery && !language && !topic && sort === 'popular' && page === 1;
    const cacheKey = 'books_list';
    const cachedData = useCache ? cache.get(cacheKey) : null;
    
    let books;
    let totalPages = 1;
    let hasNextPage = false;
    let hasPrevPage = false;
    
    if (cachedData) {
      books = cachedData.books;
      totalPages = cachedData.totalPages;
      hasNextPage = cachedData.hasNextPage;
      hasPrevPage = cachedData.hasPrevPage;
    } else {
      // Build query parameters for Gutendex API
      const params = {
        page,
        per_page: 28 // Show more books per page
      };
      
      // Add search parameters if provided
      if (searchQuery) {
        params.search = searchQuery;
      }
      
      if (language) {
        params.languages = language;
      }
      
      if (topic) {
        params.topic = topic;
      }
      
      // Handle sorting
      if (sort === 'popular') {
        // Default sorting in Gutendex is by popularity
      } else if (sort === 'title') {
        params.sort = 'title';
      } else if (sort === 'author') {
        params.sort = 'author';
      } else if (sort === 'recent') {
        params.sort = 'recent';
      }
      
      console.log('Fetching books with params:', params);
      
      const response = await axios.get('https://gutendex.com/books/', {
        params
      });
      
      books = response.data.results;
      const totalCount = response.data.count || 0;
      totalPages = Math.ceil(totalCount / 28);
      hasNextPage = response.data.next !== null;
      hasPrevPage = response.data.previous !== null;
      
      // Only cache results if no search parameters were used
      if (useCache) {
        cache.set(cacheKey, {
          books,
          totalPages,
          hasNextPage,
          hasPrevPage
        }, cacheDuration);
      }
    }
    
    // Add isFavorite flag to each book
    books = books.map(book => ({
      ...book,
      isFavorite: userFavoriteBooks.has(book.id.toString())
    }));
    
    res.render('books', { 
      books, 
      user: req.session.user,
      error: null,
      searchQuery,
      language,
      sort,
      topic,
      page,
      totalPages,
      hasNextPage,
      hasPrevPage,
      noResults: books.length === 0 && searchQuery
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.render('books', { 
      books: [], 
      error: 'Failed to fetch books. Please try again later.',
      user: req.session.user,
      searchQuery: req.query.search || '',
      language: req.query.language || '',
      sort: req.query.sort || 'popular',
      topic: req.query.topic || '',
      page: parseInt(req.query.page) || 1,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
      noResults: false
    });
  }
});

// Book details route
app.get('/book/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const cacheKey = `book_${bookId}`;
    const cachedData = cache.get(cacheKey);
    
    let book;
    if (cachedData) {
      book = cachedData;
    } else {
      const response = await axios.get(`https://gutendex.com/books/${bookId}`);
      book = response.data;
      cache.set(cacheKey, book, cacheDuration);
    }
    
    // Check if book is in user's favorites
    const userId = req.session.user?.id;
    const userFavoriteBooks = userId && userFavorites.has(userId) 
      ? userFavorites.get(userId)
      : new Map();
    
    book.isFavorite = userFavoriteBooks.has(bookId.toString());
    
    res.render('book-details', { 
      book,
      user: req.session.user,
      error: null
    });
  } catch (error) {
    console.error('Error fetching book details:', error);
    res.render('book-details', {
      book: null,
      user: req.session.user,
      error: 'Failed to fetch book details. Please try again later.'
    });
  }
});

// Route for reading a book
app.get('/read/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const page = parseInt(req.query.page || 0);
    
    // Get book details
    const book = await getBookById(bookId);
    
    if (!book) {
      return res.status(404).render('error', { message: 'Book not found' });
    }
    
    // Log available formats for debugging
    console.log('Book formats available for book ID', bookId, ':', Object.keys(book.formats));
    
    // Try to get a text URL from various possible formats
    let textUrl = null;
    
    // Define format priorities - we'll try them in this order
    const formatPriorities = [
      'text/plain',
      'text/plain; charset=utf-8',
      'text/plain; charset=us-ascii',
      'text/plain; charset=iso-8859-1',
      'text/plain; charset=windows-1252',
      'text/html',
      'text/html; charset=utf-8'
    ];
    
    // Try each format in order of priority
    for (const format of formatPriorities) {
      if (book.formats[format]) {
        textUrl = book.formats[format];
        console.log(`Using format: ${format} with URL: ${textUrl}`);
        break;
      }
    }
    
    // If no suitable text format was found
    if (!textUrl) {
      console.log('No suitable text format found for book ID:', book.id);
      return res.render('read-book', { 
        book, 
        error: 'No plain text format available for this book. Please try another book.',
        page: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
        currentPageContent: ''
      });
    }
    
    // Check cache for specific page content
    const pageCacheKey = `page_${bookId}_${page}`;
    let pageContent = cache.get(pageCacheKey);
    let totalPages = cache.get(`total_pages_${bookId}`);
    
    if (!pageContent) {
      // Check if we have page ranges cached
      const pageRangeCacheKey = `page_range_${bookId}_${Math.floor(page / 10) * 10}`;
      const pageRange = cache.get(pageRangeCacheKey);
      
      if (pageRange && pageRange[page % 10]) {
        // We have this page in the range cache
        pageContent = pageRange[page % 10];
        console.log(`Using cached page ${page} from range cache`);
      } else {
        // We need to fetch content for this page range
        console.log(`Fetching page ${page} content for book ${bookId}`);
        
        // Check if we have total pages cached
        if (!totalPages) {
          // We need to determine the total number of pages
          // First check if we have the book metadata cached
          const bookMetaCacheKey = `book_meta_${bookId}`;
          let bookMeta = cache.get(bookMetaCacheKey);
          
          if (!bookMeta) {
            // Fetch just enough content to determine total pages
            console.log(`Fetching book metadata from URL: ${textUrl}`);
            
            try {
              // Use HEAD request first to check content length
              const headResponse = await axios.head(textUrl, {
                timeout: 5000,
                headers: {
                  'Accept': 'text/plain'
                }
              });
              
              const contentLength = parseInt(headResponse.headers['content-length'] || 0);
              
              if (contentLength > 0) {
                // Estimate total pages based on content length
                // Assuming average of 2500 chars per page
                const estimatedPages = Math.ceil(contentLength / 2500);
                bookMeta = { estimatedTotalPages: estimatedPages };
                
                // Cache the metadata
                cache.set(bookMetaCacheKey, bookMeta, cacheDuration);
                totalPages = estimatedPages;
                cache.set(`total_pages_${bookId}`, totalPages, cacheDuration);
                
                console.log(`Estimated total pages: ${estimatedPages} based on content length: ${contentLength}`);
              } else {
                // If we can't get content length, fetch a small portion to analyze
                const sampleResponse = await axios.get(textUrl, {
                  timeout: 10000,
                  responseType: 'text',
                  headers: {
                    'Accept': 'text/plain',
                    'Range': 'bytes=0-10000' // Get first 10KB to analyze
                  }
                });
                
                // Analyze the sample to estimate total size
                const sampleText = sampleResponse.data || '';
                const avgCharsPerLine = sampleText.length / (sampleText.split('\n').length || 1);
                
                // Try to get total lines from response headers if available
                let totalLines = 0;
                if (sampleResponse.headers['content-range']) {
                  const match = sampleResponse.headers['content-range'].match(/bytes 0-\d+\/(\d+)/);
                  if (match && match[1]) {
                    const totalBytes = parseInt(match[1]);
                    totalLines = Math.ceil(totalBytes / avgCharsPerLine);
                  }
                }
                
                // If we couldn't determine from headers, make a rough estimate
                if (totalLines === 0) {
                  totalLines = 5000; // Default assumption for a book
                }
                
                const CHARS_PER_PAGE = 2500;
                const estimatedPages = Math.ceil((totalLines * avgCharsPerLine) / CHARS_PER_PAGE);
                
                bookMeta = { estimatedTotalPages: estimatedPages };
                
                // Cache the metadata
                cache.set(bookMetaCacheKey, bookMeta, cacheDuration);
                totalPages = estimatedPages;
                cache.set(`total_pages_${bookId}`, totalPages, cacheDuration);
                
                console.log(`Estimated total pages: ${estimatedPages} based on sample analysis`);
              }
            } catch (error) {
              console.error('Error fetching book metadata:', error.message);
              // Default to a reasonable number if we can't determine
              bookMeta = { estimatedTotalPages: 100 };
              cache.set(bookMetaCacheKey, bookMeta, cacheDuration);
              totalPages = 100;
              cache.set(`total_pages_${bookId}`, totalPages, cacheDuration);
            }
          } else {
            totalPages = bookMeta.estimatedTotalPages;
          }
        }
        
        // Now fetch just the content for the current page range (10 pages at a time)
        const startPage = Math.floor(page / 10) * 10;
        const endPage = Math.min(startPage + 9, totalPages - 1);
        
        // Calculate byte range to fetch based on page numbers
        // This is an approximation - we'll fetch a chunk of text that should contain our pages
        const CHARS_PER_PAGE = 2500;
        const startByte = startPage * CHARS_PER_PAGE;
        const bytesToFetch = (endPage - startPage + 1) * CHARS_PER_PAGE * 1.5; // Add 50% buffer
        
        console.log(`Fetching content for pages ${startPage}-${endPage} (bytes: ${startByte}-${startByte + bytesToFetch})`);
        
        try {
          // Fetch the text content for this range
          const rangeResponse = await axios.get(textUrl, {
            timeout: 15000,
            responseType: 'text',
            headers: {
              'Accept': 'text/plain',
              'Range': `bytes=${startByte}-${startByte + bytesToFetch}`
            }
          });
          
          if (!rangeResponse.data) {
            throw new Error('Empty response from text content URL');
          }
          
          // Process the text chunk
          let processedText = rangeResponse.data;
          
          // If this is the first chunk, try to remove the Gutenberg header
          if (startPage === 0) {
            // Try to find and remove the Gutenberg header
            const headerEndMarkers = [
              "*** START OF THE PROJECT GUTENBERG EBOOK",
              "*** START OF THIS PROJECT GUTENBERG EBOOK",
              "***START OF THE PROJECT GUTENBERG EBOOK",
              "*** START OF THE PROJECT GUTENBERG",
              "*** START OF THIS PROJECT GUTENBERG",
              "*** START OF THE PROJECT",
              "*END*THE SMALL PRINT"
            ];
            
            for (const marker of headerEndMarkers) {
              const headerEndIndex = processedText.indexOf(marker);
              if (headerEndIndex !== -1) {
                // Find the end of the line containing the marker
                const lineEndIndex = processedText.indexOf('\n', headerEndIndex);
                if (lineEndIndex !== -1) {
                  processedText = processedText.substring(lineEndIndex + 1);
                  break;
                }
              }
            }
          }
          
          // If this might be the last chunk, try to remove the Gutenberg footer
          if (endPage >= totalPages - 10) {
            // Try to find and remove the Gutenberg footer
            const footerStartMarkers = [
              "*** END OF THE PROJECT GUTENBERG EBOOK",
              "*** END OF THIS PROJECT GUTENBERG EBOOK",
              "***END OF THE PROJECT GUTENBERG EBOOK",
              "*** END OF THE PROJECT GUTENBERG",
              "*** END OF THIS PROJECT GUTENBERG",
              "End of the Project Gutenberg",
              "End of Project Gutenberg"
            ];
            
            for (const marker of footerStartMarkers) {
              const footerStartIndex = processedText.indexOf(marker);
              if (footerStartIndex !== -1) {
                processedText = processedText.substring(0, footerStartIndex);
                break;
              }
            }
          }
          
          // Split the processed text into pages
          const rangePages = [];
          let currentPage = '';
          let charCount = 0;
          
          // Split text into lines first
          const lines = processedText.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // If adding this line would exceed the page size, start a new page
            if (charCount + line.length > CHARS_PER_PAGE && currentPage.length > 0) {
              rangePages.push(currentPage);
              currentPage = line;
              charCount = line.length;
            } else {
              // Otherwise, add the line to the current page
              currentPage += (currentPage.length > 0 ? '\n' : '') + line;
              charCount += line.length;
            }
          }
          
          // Add the last page if it's not empty
          if (currentPage.length > 0) {
            rangePages.push(currentPage);
          }
          
          // Cache the page range
          cache.set(pageRangeCacheKey, rangePages, cacheDuration);
          
          // Get the requested page from the range
          const pageIndexInRange = page - startPage;
          if (pageIndexInRange >= 0 && pageIndexInRange < rangePages.length) {
            pageContent = rangePages[pageIndexInRange];
            
            // Cache this specific page
            cache.set(pageCacheKey, pageContent, cacheDuration);
          } else {
            // Page not found in the range
            pageContent = "Page content not available. The page might be out of range.";
          }
          
        } catch (error) {
          console.error(`Error fetching page range ${startPage}-${endPage}:`, error.message);
          pageContent = `Error loading page content: ${error.message}`;
        }
      }
    }
    
    // Handle case where no content was found
    if (!pageContent) {
      return res.render('read-book', { 
        book, 
        error: 'No readable content found for this page. Please try another page or book.',
        page: page || 0,
        totalPages: totalPages || 1,
        hasNext: false,
        hasPrev: page > 0,
        currentPageContent: ''
      });
    }
    
    // Calculate pagination info
    const hasNext = page < totalPages - 1;
    const hasPrev = page > 0;
    
    res.render('read-book', {
      book,
      currentPageContent: pageContent,
      page,
      totalPages,
      hasNext,
      hasPrev
    });
  } catch (error) {
    console.error('Error reading book:', error.message);
    
    // Provide more specific error messages based on the error type
    let errorMessage = 'Failed to read book. Please try another book or format.';
    
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timed out. The book source might be temporarily unavailable.';
    } else if (error.response) {
      errorMessage = `Server responded with status ${error.response.status}: ${error.response.statusText}`;
    }
    
    res.status(500).render('error', { message: errorMessage });
  }
});

// Profile route
app.get('/profile', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const favorites = userFavorites.has(userId) 
    ? Array.from(userFavorites.get(userId).values())
    : [];

  res.render('profile', {
    user: req.session.user,
    title: 'Profile | Storia',
    favorites: favorites
  });
});

// Add favorite book
app.post('/api/favorites/add', requireAuth, (req, res) => {
  const { bookId, bookTitle, bookAuthor, bookCover } = req.body;
  const userId = req.session.user.id;

  if (!userFavorites.has(userId)) {
    userFavorites.set(userId, new Map());
  }

  userFavorites.get(userId).set(bookId, {
    id: bookId,
    title: bookTitle,
    author: bookAuthor,
    cover: bookCover,
    addedAt: new Date()
  });

  res.json({ success: true });
});

// Remove favorite book
app.post('/api/favorites/remove', requireAuth, (req, res) => {
  const { bookId } = req.body;
  const userId = req.session.user.id;

  if (userFavorites.has(userId)) {
    userFavorites.get(userId).delete(bookId);
  }

  res.json({ success: true });
});

// Get user favorites
app.get('/api/favorites', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const favorites = userFavorites.has(userId) 
    ? Array.from(userFavorites.get(userId).values())
    : [];

  res.json(favorites);
});

// Search page route - redirect to books page
app.get('/search', async (req, res) => {
  // Get search parameters
  const searchQuery = req.query.q || '';
  const language = req.query.language || '';
  const sort = req.query.sort || 'popular';
  const topic = req.query.topic || '';
  const page = req.query.page || '1';
  
  // Redirect to books page with the same parameters
  res.redirect(`/books?search=${encodeURIComponent(searchQuery)}&language=${language}&topic=${topic}&sort=${sort}&page=${page}`);
});

// Simplified music generation endpoint for Vercel
app.post('/api/music/generate-simple', async (req, res) => {
  try {
    const { text, duration } = req.body;
    
    console.log('===== SIMPLIFIED MUSIC GENERATION REQUEST =====');
    console.log(`Received text of length: ${text ? text.length : 0}`);
    console.log(`Server environment: ${process.env.NODE_ENV}`);
    
    if (!text) {
      return res.status(400).json({ error: 'Text content is required' });
    }
    
    // Get API key from environment
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.error('ELEVENLABS_API_KEY not found in environment variables');
      return res.status(500).json({ 
        error: 'API key is missing',
        details: 'ELEVENLABS_API_KEY is not set in environment'
      });
    }
    
    console.log(`API key available (${apiKey.length} chars)`);
    
    // Generate a simple prompt based on the text
    const textSample = text.slice(0, 300); // Take a sample of the text
    const prompt = `Create background music for the following passage: "${textSample}..." The music should match the emotional tone of the text.`;
    
    console.log('Making direct API call to ElevenLabs...');
    
    // Make the API call directly to ElevenLabs
    try {
      const response = await axios({
        method: 'post',
        url: 'https://api.elevenlabs.io/v1/sound-generation',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        data: {
          text: prompt,
          duration_seconds: duration || 15.0,
          prompt_influence: 0.7,
          output_format: 'mp3_44100'
        },
        responseType: 'arraybuffer',
        timeout: 60000 // 60 second timeout
      });
      
      console.log(`ElevenLabs API call successful, received ${response.data.length} bytes`);
      
      // Sanitize the prompt for use in headers by removing problematic characters
      const sanitizedPrompt = prompt
        .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII characters
        .replace(/[\r\n"]/g, ' ') // Replace newlines, quotes with spaces
        .substring(0, 100); // Limit length
      
      // Set response headers with sanitized values
      res.set({
        'Content-Type': 'audio/mpeg',
        'X-Detected-Mood': 'custom',
        'X-Ambiance-Prompt': sanitizedPrompt,
        'X-Direct-Generation': 'true'
      });
      
      // Send the audio data
      res.send(Buffer.from(response.data));
    } catch (apiError) {
      console.error('ElevenLabs API error:', apiError.message);
      
      let errorDetails = {
        message: apiError.message
      };
      
      if (apiError.response) {
        console.error('Response status:', apiError.response.status);
        errorDetails.status = apiError.response.status;
        errorDetails.statusText = apiError.response.statusText;
        
        // Add specific error message for 401 error
        if (apiError.response.status === 401) {
          console.error('Authentication failed: Invalid or missing API key');
          errorDetails.message = 'Authentication failed: The API key provided is invalid or missing. Please check your API key in the .env file and ensure it is correctly set.';
          errorDetails.suggestion = 'Verify that your API key is valid and properly configured in the environment variables. You can find your API key in your ElevenLabs account dashboard.';
          errorDetails.documentation = 'For more information, visit: https://help.elevenlabs.io/hc/en-us/articles/19572237925521-API-Error-Code-400-or-401';
        }
        
        if (apiError.response.data) {
          try {
            // Try to parse error data if not binary
            if (typeof apiError.response.data === 'string') {
              errorDetails.data = apiError.response.data;
            } else {
              const errorText = Buffer.from(apiError.response.data).toString('utf8');
              try {
                errorDetails.data = JSON.parse(errorText);
              } catch (e) {
                errorDetails.data = errorText;
              }
            }
          } catch (e) {
            errorDetails.dataError = e.message;
          }
        }
      }
      
      return res.status(apiError.response?.status || 500).json({ 
        error: 'Failed to generate music',
        details: errorDetails
      });
    }
  } catch (error) {
    console.error('Unexpected error in simplified music generation:', error.message);
    console.error(error.stack);
    
    return res.status(500).json({ 
      error: 'Unexpected error in music generation',
      message: error.message,
      stack: error.stack
    });
  }
});

// Generate background music API endpoint
app.post('/api/music/generate', async (req, res) => {
  try {
    const { text } = req.body;
    
    console.log('===== MUSIC GENERATION REQUEST =====');
    console.log(`Received text of length: ${text ? text.length : 0}`);
    
    if (!text) {
      console.error('No text provided in request');
      return res.status(400).json({ error: 'Text content is required' });
    }
    
    // First, generate an ambiance prompt using the Python script
    console.log('Calling Python ambiance generator script...');
    console.log(`Text preview: "${text.substring(0, 100)}..."`);
    
    // Check Python availability before calling
    const isPythonAvailable = await pythonBridge.isPythonAvailable();
    console.log(`Python availability check: ${isPythonAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    
    if (!isPythonAvailable) {
      console.error('Python is not available on this system');
      return res.status(500).json({ 
        error: 'Python is not available on this system',
        details: 'The ambiance generator requires Python to be installed.'
      });
    }
    
    // Generate ambiance prompt
    console.log('Generating ambiance prompt for music...');
    const ambianceResult = await pythonBridge.generateAmbiancePrompt(text);
    
    console.log('Ambiance generation completed');
    console.log('Result structure:', Object.keys(ambianceResult));
    
    // Extract the ambiance prompt
    const ambiancePrompt = ambianceResult.ambiance_prompt;
    const mood = ambianceResult.mood || 'neutral';
    
    console.log(`Detected mood: "${mood}"`);
    console.log(`Ambiance prompt: "${ambiancePrompt}"`);
    
    // If there was an error in ambiance generation, log it but continue
    if (ambianceResult.error) {
      console.warn('Warning in ambiance generation:', ambianceResult.error);
    }
    
    // Get the API key directly from environment variables
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.error('ELEVENLABS_API_KEY not found in environment variables');
      throw new Error('ELEVENLABS_API_KEY is not set in environment variables');
    }
    
    console.log('API Key length:', apiKey.length);
    console.log('API Key prefix:', apiKey.substring(0, 5) + '...');
    
    // Make a direct API call using axios instead of the client library
    try {
      console.log('Making direct API call to ElevenLabs...');
      
      const response = await axios({
        method: 'post',
        url: 'https://api.elevenlabs.io/v1/sound-generation',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        data: {
          text: ambiancePrompt,
          duration_seconds: 15,
          prompt_influence: 0.5
        },
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      console.log('Direct API call successful');
      console.log('Response status:', response.status);
      console.log('Response data length:', response.data.length);
      
      // Send the detected mood in the response headers
      res.set('X-Detected-Mood', mood);
      res.set('X-Ambiance-Prompt', ambiancePrompt.substring(0, 100) + (ambiancePrompt.length > 100 ? '...' : ''));
      
      // Send the audio data back to the client
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(response.data));
    } catch (apiError) {
      console.error('ElevenLabs API error:', apiError.message);
      
      // Use fallback audio based on mood
      let fallbackAudioPath;
      
      // Select a fallback audio file based on the detected mood
      switch (mood.toLowerCase()) {
        case 'happy':
        case 'joyful':
        case 'cheerful':
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-happy.mp3');
          break;
        case 'sad':
        case 'melancholic':
        case 'somber':
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-sad.mp3');
          break;
        case 'tense':
        case 'suspenseful':
        case 'anxious':
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-tense.mp3');
          break;
        case 'peaceful':
        case 'calm':
        case 'serene':
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-peaceful.mp3');
          break;
        case 'exciting':
        case 'thrilling':
        case 'energetic':
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-exciting.mp3');
          break;
        case 'romantic':
        case 'loving':
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-romantic.mp3');
          break;
        case 'mysterious':
        case 'enigmatic':
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-mysterious.mp3');
          break;
        default:
          fallbackAudioPath = path.join(__dirname, '../public/audio/fallback-neutral.mp3');
      }
      
      // Check if the fallback audio file exists
      try {
        if (fs.existsSync(fallbackAudioPath)) {
          // Read the fallback audio file
          const fallbackAudio = fs.readFileSync(fallbackAudioPath);
          
          // Send the fallback audio
          res.set('X-Detected-Mood', mood);
          res.set('X-Ambiance-Prompt', ambiancePrompt.substring(0, 100) + (ambiancePrompt.length > 100 ? '...' : ''));
          res.set('X-Fallback-Audio', 'true');
          res.set('Content-Type', 'audio/mpeg');
          res.send(fallbackAudio);
        } else {
          // If the specific mood fallback doesn't exist, try the neutral one
          const neutralFallbackPath = path.join(__dirname, '../public/audio/fallback-neutral.mp3');
          
          if (fs.existsSync(neutralFallbackPath)) {
            const neutralFallback = fs.readFileSync(neutralFallbackPath);
            res.set('X-Detected-Mood', 'neutral');
            res.set('X-Ambiance-Prompt', ambiancePrompt.substring(0, 100) + (ambiancePrompt.length > 100 ? '...' : ''));
            res.set('X-Fallback-Audio', 'true');
            res.set('Content-Type', 'audio/mpeg');
            res.send(neutralFallback);
          } else {
            // If no fallback exists, create a simple audio buffer
            console.log('No fallback audio files available, creating empty audio');
            const emptyAudio = Buffer.alloc(1024);
            res.set('X-Detected-Mood', 'neutral');
            res.set('X-Ambiance-Prompt', ambiancePrompt.substring(0, 100) + (ambiancePrompt.length > 100 ? '...' : ''));
            res.set('X-Fallback-Audio', 'true');
            res.set('Content-Type', 'audio/mpeg');
            res.send(emptyAudio);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback audio error:', fallbackError.message);
        
        // Create a simple audio buffer as a last resort
        console.log('Creating empty audio as last resort');
        const emptyAudio = Buffer.alloc(1024);
        res.set('X-Detected-Mood', 'neutral');
        res.set('X-Ambiance-Prompt', ambiancePrompt.substring(0, 100) + (ambiancePrompt.length > 100 ? '...' : ''));
        res.set('X-Fallback-Audio', 'true');
        res.set('Content-Type', 'audio/mpeg');
        res.send(emptyAudio);
      }
    }
  } catch (error) {
    console.error('Error generating music:', error.message);
    
    // Provide more detailed error information
    let errorMessage = 'Failed to generate music';
    let statusCode = 500;
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      statusCode = error.response.status;
      console.error(`ElevenLabs API responded with status ${statusCode}`);
      console.error('Response headers:', JSON.stringify(error.response.headers));
      
      if (error.response.data) {
        try {
          // Try to parse the error data if it's in buffer format
          let errorData;
          if (error.response.data instanceof Buffer) {
            const dataString = error.response.data.toString();
            try {
              errorData = JSON.parse(dataString);
            } catch (e) {
              errorData = { message: dataString };
            }
          } else {
            errorData = error.response.data;
          }
          
          console.error('Error details:', errorData);
          errorMessage = `ElevenLabs API error: ${errorData.detail || errorData.message || 'Unknown error'}`;
        } catch (e) {
          console.error('Could not parse error response:', e.message);
        }
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from ElevenLabs API');
      errorMessage = 'No response from ElevenLabs API';
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up request:', error.message);
      errorMessage = `Request setup error: ${error.message}`;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: error.message
    });
  }
});

// Generate ambiance prompt API endpoint
app.post('/api/ambiance/generate', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text content is required' });
    }
    
    console.log('Generating ambiance prompt for text of length:', text.length);
    
    // Call the Python script to generate an ambiance prompt
    const result = await pythonBridge.generateAmbiancePrompt(text);
    
    // Log the generated prompt
    console.log('Generated ambiance prompt:', result.ambiance_prompt);
    
    // Check if there was an error
    if (result.error) {
      console.warn('Warning in ambiance generation:', result.error);
    }
    
    // Send the result back to the client
    res.json(result);
  } catch (error) {
    console.error('Error generating ambiance prompt:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate ambiance prompt',
      details: error.message
    });
  }
});

// Helper function to generate a music prompt based on text content
function generateMusicPrompt(text) {
  // Extract key themes, emotions, and setting from the text
  const cleanText = text.replace(/\n/g, ' ').trim();
  const excerpt = cleanText.substring(0, 1000); // Use first 1000 characters
  
  // Analyze text for mood and themes
  const moodKeywords = {
    happy: ['happy', 'joy', 'laugh', 'smile', 'delight', 'cheerful', 'merry'],
    sad: ['sad', 'sorrow', 'grief', 'weep', 'tear', 'mourn', 'melancholy'],
    tense: ['fear', 'danger', 'threat', 'worry', 'anxious', 'terror', 'horror'],
    peaceful: ['peace', 'calm', 'tranquil', 'serene', 'gentle', 'quiet', 'still'],
    exciting: ['adventure', 'thrill', 'exciting', 'action', 'rush', 'speed', 'chase'],
    romantic: ['love', 'romance', 'passion', 'embrace', 'kiss', 'tender', 'affection'],
    mysterious: ['mystery', 'secret', 'unknown', 'strange', 'curious', 'wonder', 'enigma']
  };
  
  // Count occurrences of mood keywords
  const moodCounts = {};
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    moodCounts[mood] = 0;
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = excerpt.match(regex);
      if (matches) {
        moodCounts[mood] += matches.length;
      }
    });
  }
  
  // Determine dominant mood
  let dominantMood = 'neutral';
  let maxCount = 0;
  for (const [mood, count] of Object.entries(moodCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantMood = mood;
    }
  }
  
  // Create a concise prompt for the ElevenLabs sound effects API
  let prompt;
  
  switch (dominantMood) {
    case 'happy':
      prompt = "Uplifting, cheerful background music with major keys and a moderate tempo";
      break;
    case 'sad':
      prompt = "Melancholic, emotional background music with minor keys and a slow tempo";
      break;
    case 'tense':
      prompt = "Suspenseful, tense background music with dissonant chords and a building rhythm";
      break;
    case 'peaceful':
      prompt = "Calm, serene background music with soft instruments and a slow, flowing tempo";
      break;
    case 'exciting':
      prompt = "Energetic, adventurous background music with a fast tempo and strong rhythms";
      break;
    case 'romantic':
      prompt = "Tender, emotional background music with string instruments and a gentle melody";
      break;
    case 'mysterious':
      prompt = "Intriguing, enigmatic background music with unusual harmonies and a moderate tempo";
      break;
    default:
      prompt = "Balanced, subtle background music with a mix of instruments and a moderate tempo";
  }
  
  // Add that it should be suitable for reading
  prompt += " suitable for reading background music, instrumental without vocals";
  
  return { prompt, mood: dominantMood };
}

// Debug endpoint to check if environment variables are loaded correctly
app.get('/api/debug/env', (req, res) => {
  // Only enable in development mode for security
  if (process.env.NODE_ENV !== 'production') {
    res.json({
      nodeEnv: process.env.NODE_ENV,
      elevenlabsKeyLength: process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.length : 0,
      elevenlabsKeyPrefix: process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.substring(0, 5) + '...' : 'not set',
      port: process.env.PORT,
      cacheDuration: process.env.CACHE_DURATION,
      enableCompression: process.env.ENABLE_COMPRESSION
    });
  } else {
    res.status(403).json({ error: 'Debug endpoints are disabled in production mode' });
  }
});

// Test endpoint to check ElevenLabs API connectivity
app.get('/api/test/elevenlabs', async (req, res) => {
  try {
    // Only enable in development mode for security
    if (process.env.NODE_ENV !== 'production') {
      // Test connection to ElevenLabs API
      const response = await axios.get('https://api.elevenlabs.io/v1/models', {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      });
      
      res.json({
        status: 'success',
        message: 'Successfully connected to ElevenLabs API',
        models: response.data.models ? response.data.models.map(m => m.model_id) : []
      });
    } else {
      res.status(403).json({ error: 'Test endpoints are disabled in production mode' });
    }
  } catch (error) {
    console.error('Error testing ElevenLabs API:', error.message);
    
    let errorDetail = 'Unknown error';
    let statusCode = 500;
    
    if (error.response) {
      statusCode = error.response.status;
      errorDetail = error.response.data ? JSON.stringify(error.response.data) : error.response.statusText;
    } else if (error.request) {
      errorDetail = 'No response received from ElevenLabs API';
    } else {
      errorDetail = error.message;
    }
    
    res.status(statusCode).json({
      status: 'error',
      message: 'Failed to connect to ElevenLabs API',
      error: errorDetail
    });
  }
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'API server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API key check endpoint
app.get('/api/check-key-direct', async (req, res) => {
  try {
    // Get the API key directly from environment variables
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({
        status: 'error',
        message: 'ELEVENLABS_API_KEY is not set in environment variables',
        keyLength: 0,
        keyPrefix: 'none'
      });
    }
    
    console.log('Checking API key, length:', apiKey.length);
    console.log('API Key prefix:', apiKey.substring(0, 5) + '...');
    
    // Make a direct API call to check if the key is valid
    try {
      const response = await axios({
        method: 'get',
        url: 'https://api.elevenlabs.io/v1/voices',
        headers: {
          'Accept': 'application/json',
          'xi-api-key': apiKey
        },
        timeout: 10000
      });
      
      // If we get here, the API key is valid
      const voicesCount = response.data.voices ? response.data.voices.length : 0;
      
      return res.json({
        status: 'success',
        message: 'API key is valid',
        keyLength: apiKey.length,
        keyPrefix: apiKey.substring(0, 5) + '...',
        voicesCount: voicesCount
      });
    } catch (apiError) {
      console.error('API key validation error:', apiError.message);
      
      // Check if we got a response with status code
      if (apiError.response) {
        return res.status(apiError.response.status).json({
          status: 'error',
          message: `API key validation failed with status ${apiError.response.status}`,
          details: apiError.response.data || apiError.message,
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 5) + '...'
        });
      } else if (apiError.request) {
        // The request was made but no response was received
        return res.status(500).json({
          status: 'error',
          message: 'No response received from ElevenLabs API',
          details: apiError.message,
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 5) + '...'
        });
      } else {
        // Something happened in setting up the request
        return res.status(500).json({
          status: 'error',
          message: 'Error setting up request to ElevenLabs API',
          details: apiError.message,
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 5) + '...'
        });
      }
    }
  } catch (error) {
    console.error('Error checking API key:', error.message);
    
    return res.status(500).json({
      status: 'error',
      message: 'Error checking API key',
      details: error.message
    });
  }
});

// Test audio endpoint
app.get('/api/test-audio', (req, res) => {
  const mood = req.query.mood || 'neutral';
  
  // Create a simple audio buffer (empty audio)
  const audioBuffer = Buffer.alloc(1024);
  
  res.set('X-Detected-Mood', mood);
  res.set('X-Test-Audio', 'true');
  res.set('Content-Type', 'audio/mpeg');
  res.send(audioBuffer);
});

// Debug endpoint for testing the ambiance generator directly
app.post('/api/debug/ambiance', async (req, res) => {
  try {
    const { text } = req.body;
    
    console.log('===== DEBUG AMBIANCE REQUEST =====');
    console.log(`Received text of length: ${text ? text.length : 0}`);
    
    if (!text) {
      console.error('No text provided in request');
      return res.status(400).json({ error: 'Text content is required' });
    }
    
    // Check Python availability before calling
    const isPythonAvailable = await pythonBridge.isPythonAvailable();
    console.log(`Python availability check: ${isPythonAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    
    if (!isPythonAvailable) {
      console.error('Python is not available on this system');
      return res.status(500).json({ 
        error: 'Python is not available on this system',
        details: 'The ambiance generator requires Python to be installed.'
      });
    }
    
    // Generate ambiance prompt directly
    console.log('Calling ambiance generator for debugging...');
    console.log(`Text preview: "${text.substring(0, 100)}..."`);
    
    const ambianceResult = await pythonBridge.generateAmbiancePrompt(text);
    
    console.log('Ambiance generation completed for debug request');
    console.log('Result:', JSON.stringify(ambianceResult, null, 2));
    
    // Return the complete result to the client
    res.json({
      success: true,
      result: ambianceResult,
      python_available: isPythonAvailable,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in debug ambiance endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to generate ambiance prompt',
      details: error.message,
      stack: error.stack
    });
  }
});

// Generate music directly from text (one-step process)
app.post('/api/music/generate-from-text', async (req, res) => {
  try {
    const { text, duration, page } = req.body;
    
    console.log('===== DIRECT MUSIC GENERATION REQUEST =====');
    console.log(`Received text of length: ${text ? text.length : 0}`);
    console.log(`For page: ${page !== undefined ? page : 'not specified'}`);
    console.log(`Server environment: ${process.env.NODE_ENV}`);
    console.log(`API key available: ${Boolean(process.env.ELEVENLABS_API_KEY)}`);
    console.log(`API key length: ${process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.length : 0}`);
    
    if (!text) {
      console.error('No text provided in request');
      return res.status(400).json({ error: 'Text content is required' });
    }
    
    // Skip all fallback mechanisms and caching to force direct generation
    console.log('Bypassing fallbacks and attempting direct generation...');
    
    // Make a direct API call to ElevenLabs instead of using Python
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.error('ELEVENLABS_API_KEY not found in environment variables');
      return res.status(500).json({ 
        error: 'API key is missing',
        details: 'ELEVENLABS_API_KEY is not set in environment'
      });
    }
    
    // Generate a simple prompt based on the text
    const textSample = text.slice(0, 300); // Take a sample of the text
    const prompt = `Generate background music for a book passage that reads: "${textSample}..." - The music should be instrumental, subtle, and match the mood of the text.`;
    
    console.log('Using direct ElevenLabs API with prompt:', prompt);
    
    try {
      // Make the API call to ElevenLabs Sound Effects endpoint
      const response = await axios({
        method: 'post',
        url: 'https://api.elevenlabs.io/v1/sound-generation',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        data: {
          text: prompt,
          duration_seconds: duration || 15.0,
          prompt_influence: 0.7,
          output_format: 'mp3_44100'
        },
        responseType: 'arraybuffer',
        timeout: 60000 // Allow up to 60 seconds for generation
      });
      
      console.log('ElevenLabs API call successful');
      console.log('Response status:', response.status);
      console.log('Response data length:', response.data.length);
      
      // Set response headers
      res.set('X-Detected-Mood', 'custom');
      res.set('X-Ambiance-Prompt', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));
      res.set('X-Direct-Generation', 'true');
      
      // Send the audio data
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(response.data));
    } catch (apiError) {
      console.error('ElevenLabs API error:', apiError.message);
      if (apiError.response) {
        console.error('Response status:', apiError.response.status);
        console.error('Response headers:', JSON.stringify(apiError.response.headers || {}));
      }
      
      return res.status(500).json({ 
        error: 'Failed to generate music',
        details: apiError.message
      });
    }
  } catch (error) {
    console.error('Error in direct music generation:', error.message);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({ 
      error: 'Failed to generate music',
      details: error.message,
      stack: error.stack
    });
  }
});

// Function to get book details by ID
async function getBookById(bookId) {
  try {
    // Check cache for book details
    const bookCacheKey = `book_${bookId}`;
    let book = cache.get(bookCacheKey);
    
    if (!book) {
      // Fetch book details if not in cache
      const bookResponse = await axios.get(`https://gutendex.com/books/${bookId}`);
      book = bookResponse.data;
      cache.set(bookCacheKey, book, cacheDuration);
    }
    
    return book;
  } catch (error) {
    console.error(`Error fetching book ${bookId}:`, error.message);
    return null;
  }
}

// Error handling middleware
app.use((req, res, next) => {
  res.status(404).render('error', { 
    error: 'Page not found',
    message: 'The page you are looking for does not exist.',
    user: req.session.user
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  // Check if the error is related to the read-book template
  if (err.path && err.path.includes('read-book.ejs')) {
    // If it's a read-book template error, render with the necessary variables
    return res.status(500).render('read-book', {
      book: null,
      error: 'An error occurred while rendering the book page.',
      page: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
      currentPageContent: ''
    });
  }
  
  // For other errors, use the general error template
  res.status(500).render('error', { 
    error: 'Server Error',
    message: 'Something went wrong on our end. Please try again later.',
    user: req.session.user
  });
});

// Add a diagnostic endpoint
app.get('/api/diagnose', async (req, res) => {
  try {
    // Test Python availability
    const pythonAvailable = await pythonBridge.isPythonAvailable();
    
    // Get Python version if available
    let pythonVersion = 'Not available';
    let pythonPath = 'Not available';
    let pythonModules = [];
    
    if (pythonAvailable) {
      try {
        const { spawn } = require('child_process');
        const pythonProcess = spawn('python3', ['--version']);
        let versionOutput = '';
        
        pythonProcess.stdout.on('data', (data) => {
          versionOutput += data.toString();
        });
        
        await new Promise((resolve) => {
          pythonProcess.on('close', (code) => {
            resolve(code);
          });
        });
        
        pythonVersion = versionOutput.trim();
        
        // Try to get Python path
        const pathProcess = spawn('which', ['python3']);
        let pathOutput = '';
        
        pathProcess.stdout.on('data', (data) => {
          pathOutput += data.toString();
        });
        
        await new Promise((resolve) => {
          pathProcess.on('close', (code) => {
            resolve(code);
          });
        });
        
        pythonPath = pathOutput.trim();
        
        // Check available modules
        const modulesProcess = spawn('pip', ['list']);
        let modulesOutput = '';
        
        modulesProcess.stdout.on('data', (data) => {
          modulesOutput += data.toString();
        });
        
        await new Promise((resolve) => {
          modulesProcess.on('close', (code) => {
            resolve(code);
          });
        });
        
        pythonModules = modulesOutput.trim().split('\n')
          .filter(line => line.includes('elevenlabs') || 
                  line.includes('openai') || 
                  line.includes('requests') || 
                  line.includes('python-dotenv'))
          .map(line => line.trim());
      } catch (error) {
        console.error('Error getting Python details:', error);
      }
    }
    
    // Get environment info
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
      elevenLabsKeyLength: process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.length : 0,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      openAIKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    };
    
    // Get file system info
    const fsInfo = {
      musicGenExists: fs.existsSync(path.join(__dirname, '../python_scripts/music_gen.py')),
      ambianceGenExists: fs.existsSync(path.join(__dirname, '../python_scripts/ambiance_generator.py')),
      requirementsExists: fs.existsSync(path.join(__dirname, '../python_scripts/requirements.txt')),
      fallbackAudioExists: fs.existsSync(path.join(__dirname, '../public/audio/fallback-neutral.mp3')),
      tmpDirWritable: await isTmpDirWritable()
    };
    
    res.json({
      timestamp: new Date().toISOString(),
      pythonAvailable,
      pythonVersion,
      pythonPath,
      pythonModules,
      environment: envInfo,
      filesystem: fsInfo
    });
  } catch (error) {
    console.error('Error in diagnosis endpoint:', error);
    res.status(500).json({
      error: 'Diagnosis failed',
      message: error.message,
      stack: error.stack
    });
  }
});

// Helper function to check if temp directory is writable
async function isTmpDirWritable() {
  try {
    const tempFile = path.join(os.tmpdir(), `test_write_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, 'test');
    fs.unlinkSync(tempFile);
    return true;
  } catch (error) {
    console.error('Temp directory not writable:', error);
    return false;
  }
}

// Add an endpoint to run the Python environment checker
app.get('/api/check-python-env', async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const pythonCommand = await pythonBridge.getPythonCommand();
    const scriptPath = path.join(__dirname, '../python_scripts/check_env.py');
    
    console.log(`Running Python environment check: ${pythonCommand} ${scriptPath}`);
    
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({
        error: 'Environment check script not found',
        scriptPath
      });
    }
    
    const pythonProcess = spawn(pythonCommand, [scriptPath]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log(`Python environment check stderr: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`Python environment check exited with code ${code}`);
      
      let result = {};
      try {
        // Try to parse the JSON output
        const jsonStartIndex = output.indexOf('{');
        const jsonEndIndex = output.lastIndexOf('}') + 1;
        
        if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
          const jsonOutput = output.substring(jsonStartIndex, jsonEndIndex);
          result = JSON.parse(jsonOutput);
        }
      } catch (error) {
        console.error('Error parsing Python environment check output:', error);
      }
      
      res.json({
        success: code === 0,
        exit_code: code,
        output: output,
        error: errorOutput,
        result: result,
        script_path: scriptPath
      });
    });
    
    pythonProcess.on('error', (error) => {
      console.error('Error running Python environment check:', error);
      res.status(500).json({
        error: 'Failed to run Python environment check',
        message: error.message,
        script_path: scriptPath
      });
    });
  } catch (error) {
    console.error('Error in Python environment check endpoint:', error);
    res.status(500).json({
      error: 'Python environment check failed',
      message: error.message,
      stack: error.stack
    });
  }
});

// Add a direct ElevenLabs API key test endpoint
app.get('/api/test-key', async (req, res) => {
  try {
    // Get API key
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({
        status: 'error',
        message: 'ELEVENLABS_API_KEY is missing',
        environment: process.env.NODE_ENV
      });
    }
    
    // Test with a direct API call (don't require Python)
    const response = await axios({
      method: 'get',
      url: 'https://api.elevenlabs.io/v1/voices',
      headers: {
        'xi-api-key': apiKey
      },
      timeout: 10000
    });
    
    // If we get here, the API key is valid
    return res.json({
      status: 'success',
      message: 'API key is valid',
      environment: process.env.NODE_ENV,
      keyLength: apiKey.length,
      keyPrefix: apiKey.substring(0, 5) + '***',
      voicesCount: response.data.voices ? response.data.voices.length : 0,
      voices: response.data.voices ? response.data.voices.map(v => v.name) : []
    });
  } catch (error) {
    console.error('API key test error:', error.message);
    
    let errorDetails = {
      message: error.message
    };
    
    if (error.response) {
      errorDetails.status = error.response.status;
      errorDetails.statusText = error.response.statusText;
      errorDetails.data = error.response.data;
    }
    
    return res.status(500).json({
      status: 'error',
      message: 'Failed to validate API key',
      environment: process.env.NODE_ENV,
      details: errorDetails
    });
  }
});

// Add a simple admin/test page
app.get('/admin/test', (req, res) => {
  res.render('admin');
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
});

// For Vercel serverless deployment
module.exports = app; 
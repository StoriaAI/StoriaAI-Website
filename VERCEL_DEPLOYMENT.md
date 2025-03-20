# Deploying Storia to Vercel

This guide provides detailed instructions for deploying the Storia application to Vercel.

## Prerequisites

- A GitHub account with your Storia repository
- A Vercel account (you can sign up at [vercel.com](https://vercel.com) using your GitHub account)

## Deployment Steps

### 1. Prepare Your Repository

Ensure your repository includes these key files:
- `vercel.json` - Contains Vercel-specific configuration
- Updated `package.json` with proper scripts

### 2. Import Your Project to Vercel

1. Go to [vercel.com](https://vercel.com) and log in
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Select the Storia repository from the list

### 3. Configure Project Settings

In the configuration screen:

- **Framework Preset**: Select "Other"
- **Build and Output Settings**:
  - Build Command: `npm run vercel-build`
  - Output Directory: Leave blank
  - Install Command: `npm install`
  - Development Command: `npm run dev` (this is only for preview deployments)

### 4. Environment Variables

Add the following environment variables:
- `NODE_ENV`: `production`
- `CACHE_DURATION`: `3600000`
- `ENABLE_COMPRESSION`: `true`

### 5. Deploy

Click "Deploy" to start the deployment process.

## Troubleshooting Common Issues

### Issue: "nodemon: command not found"

**Solution**: This happens because nodemon is a development dependency. We've updated the `dev` script in package.json to use `node` instead of `nodemon`.

### Issue: Build fails with other dependency errors

**Solution**: Check the build logs. You may need to add missing dependencies to the `dependencies` section (not `devDependencies`) in package.json.

### Issue: Application deploys but shows a 404 error

**Solution**: Verify your `vercel.json` file has the correct routes configuration. All routes should be directed to `src/index.js`.

### Issue: Static assets (CSS, images) not loading

**Solution**: Make sure your application is using relative paths for static assets. In Express, this is handled by the `express.static` middleware.

## Vercel-Specific Features

### Automatic Deployments

Vercel will automatically deploy your application when you push changes to your GitHub repository.

### Preview Deployments

Vercel creates preview deployments for pull requests, allowing you to test changes before merging.

### Custom Domains

You can add custom domains to your Vercel project:
1. Go to your project settings
2. Click on "Domains"
3. Add your custom domain

## Monitoring Your Deployment

After deployment, you can monitor your application:
1. Go to your Vercel dashboard
2. Select your Storia project
3. Click on "Analytics" to view performance metrics
4. Check "Logs" to troubleshoot any issues

## Need Help?

If you encounter issues not covered in this guide:
1. Check the Vercel deployment logs for specific error messages
2. Consult the [Vercel documentation](https://vercel.com/docs)
3. Search for solutions on [Stack Overflow](https://stackoverflow.com/questions/tagged/vercel) 
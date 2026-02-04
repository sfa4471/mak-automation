# Frontend Implementation Detailed Guide
## Phase 1: Settings Component - Complete Breakdown

This guide explains **in detail** how to implement the three frontend components for the Settings page:
1. **settings.ts** - TypeScript API client
2. **Settings.tsx** - React component
3. **Settings.css** - Styling

---

## Part 1: TypeScript API Client (`settings.ts`)

### 1.1 Purpose and Architecture

**What is an API Client?**
An API client is a TypeScript module that provides a clean, type-safe interface for making HTTP requests to your backend API. Instead of writing `axios.get('/api/settings/onedrive-path')` everywhere, you create reusable functions like `settingsAPI.getOneDrivePath()`.

**Why use it?**
- **Type Safety**: TypeScript ensures you use the correct data types
- **Reusability**: Write once, use anywhere
- **Maintainability**: If API changes, update one place
- **Consistency**: All API calls follow the same pattern

### 1.2 File Structure

**Location:** `client/src/api/settings.ts`

**Pattern:** Follows the same pattern as `projects.ts` and `tasks.ts`

### 1.3 Complete Implementation with Explanations

```typescript
import api from './api';

/**
 * ============================================================================
 * TYPE DEFINITIONS
 * ============================================================================
 * 
 * TypeScript interfaces define the "shape" of data structures.
 * This ensures type safety and provides autocomplete in your IDE.
 */

/**
 * Response when getting the OneDrive path
 */
export interface OneDrivePathResponse {
  success: boolean;        // Whether the request succeeded
  path: string | null;     // The configured path, or null if not set
  configured: boolean;      // Whether a path is configured
}

/**
 * Response when getting the status of OneDrive path
 * Includes validation information
 */
export interface OneDriveStatusResponse {
  success: boolean;
  configured: boolean;     // Is a path configured?
  path?: string;          // The configured path (if configured)
  isValid?: boolean;       // Does the path exist and is it a directory?
  isWritable?: boolean;    // Can we write to the directory?
  error?: string;         // Error message if validation failed
}

/**
 * Response when testing a path (without saving)
 */
export interface OneDriveTestResponse {
  success: boolean;
  isValid: boolean;        // Does the path exist and is it valid?
  isWritable?: boolean;   // Can we write to it?
  error?: string;         // Error message if invalid
}

/**
 * Request body when setting the OneDrive path
 */
export interface SetOneDrivePathRequest {
  path: string | null;    // The path to set, or null to clear
}

/**
 * Response when setting the OneDrive path
 */
export interface SetOneDrivePathResponse {
  success: boolean;
  message?: string;       // Success message
  path?: string | null;   // The path that was set
  error?: string;         // Error message if failed
}

/**
 * ============================================================================
 * API CLIENT OBJECT
 * ============================================================================
 * 
 * This object contains all the functions to interact with the settings API.
 * Each function:
 * 1. Makes an HTTP request using the base `api` client
 * 2. Returns a Promise with the typed response
 * 3. Handles errors automatically (via axios interceptors)
 */
export const settingsAPI = {
  /**
   * Get the current OneDrive base path
   * 
   * API Endpoint: GET /api/settings/onedrive-path
   * 
   * Usage:
   *   const response = await settingsAPI.getOneDrivePath();
   *   if (response.success) {
   *     console.log('Path:', response.path);
   *   }
   */
  getOneDrivePath: async (): Promise<OneDrivePathResponse> => {
    // Make GET request to /api/settings/onedrive-path
    // The `api` client automatically:
    // - Adds base URL (from api.ts)
    // - Adds authentication token (from localStorage)
    // - Handles 401 errors (redirects to login)
    const response = await api.get<OneDrivePathResponse>('/settings/onedrive-path');
    
    // Return the response data (already typed as OneDrivePathResponse)
    return response.data;
  },

  /**
   * Set or update the OneDrive base path
   * 
   * API Endpoint: POST /api/settings/onedrive-path
   * Body: { path: string | null }
   * 
   * Usage:
   *   // Set a path
   *   await settingsAPI.setOneDrivePath('C:\\Users\\Name\\OneDrive\\Projects');
   *   
   *   // Clear the path
   *   await settingsAPI.setOneDrivePath(null);
   */
  setOneDrivePath: async (path: string | null): Promise<SetOneDrivePathResponse> => {
    // Make POST request with path in the body
    const response = await api.post<SetOneDrivePathResponse>(
      '/settings/onedrive-path',
      { path }  // Shorthand for { path: path }
    );
    
    return response.data;
  },

  /**
   * Get the status of the OneDrive path
   * Includes validation information (is it valid? is it writable?)
   * 
   * API Endpoint: GET /api/settings/onedrive-status
   * 
   * Usage:
   *   const status = await settingsAPI.getOneDriveStatus();
   *   if (status.configured && status.isValid && status.isWritable) {
   *     console.log('OneDrive is ready!');
   *   }
   */
  getOneDriveStatus: async (): Promise<OneDriveStatusResponse> => {
    const response = await api.get<OneDriveStatusResponse>('/settings/onedrive-status');
    return response.data;
  },

  /**
   * Test a OneDrive path without saving it
   * Useful for validating user input before saving
   * 
   * API Endpoint: POST /api/settings/onedrive-test
   * Body: { path: string }
   * 
   * Usage:
   *   const test = await settingsAPI.testOneDrivePath('C:\\Test\\Path');
   *   if (test.isValid && test.isWritable) {
   *     // Path is good, proceed to save
   *   }
   */
  testOneDrivePath: async (path: string): Promise<OneDriveTestResponse> => {
    const response = await api.post<OneDriveTestResponse>(
      '/settings/onedrive-test',
      { path }
    );
    return response.data;
  },
};
```

### 1.4 How It Works

**The `api` Import:**
- `api` is an axios instance configured in `client/src/api/api.ts`
- It automatically:
  - Adds the base URL (e.g., `http://localhost:5000/api`)
  - Adds the authentication token from `localStorage`
  - Handles 401 errors (redirects to login)

**Type Safety:**
- `Promise<OneDrivePathResponse>` means the function returns a Promise that resolves to `OneDrivePathResponse`
- TypeScript will give you autocomplete and catch type errors

**Error Handling:**
- Errors are handled by axios interceptors in `api.ts`
- If the API returns an error, the Promise will reject
- You handle errors in the React component with try/catch

---

## Part 2: React Component (`Settings.tsx`)

### 2.1 Component Architecture

**What is a React Component?**
A React component is a JavaScript/TypeScript function that returns JSX (HTML-like syntax) to render UI. Components can have:
- **State**: Data that changes (like form inputs)
- **Props**: Data passed from parent components
- **Effects**: Side effects (like loading data when component mounts)

### 2.2 Complete Implementation with Detailed Comments

**Location:** `client/src/components/admin/Settings.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsAPI, OneDriveStatusResponse } from '../../api/settings';
import './Settings.css';

/**
 * ============================================================================
 * SETTINGS COMPONENT
 * ============================================================================
 * 
 * This component allows admin users to configure the OneDrive base path.
 * 
 * Features:
 * - Display current OneDrive path configuration
 * - Input field for new path
 * - Test path button (validates without saving)
 * - Save button (saves to database)
 * - Status display (shows current configuration status)
 * - Error handling and user feedback
 */
const Settings: React.FC = () => {
  // ==========================================================================
  // HOOKS
  // ==========================================================================
  
  /**
   * useNavigate: React Router hook for programmatic navigation
   * Usage: navigate('/dashboard') to go to dashboard
   */
  const navigate = useNavigate();

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================
  
  /**
   * State: Current path value in the input field
   * - Initial value: '' (empty string)
   * - Updates when user types in the input
   */
  const [path, setPath] = useState<string>('');

  /**
   * State: Current status from the API
   * - Loaded when component mounts
   * - Updated after saving
   * - Used to display status information
   */
  const [status, setStatus] = useState<OneDriveStatusResponse | null>(null);

  /**
   * State: Loading indicator
   * - true when API request is in progress
   * - Used to disable buttons and show loading state
   */
  const [loading, setLoading] = useState<boolean>(false);

  /**
   * State: Testing indicator
   * - true when testing path (separate from saving)
   * - Used to show "Testing..." on test button
   */
  const [testing, setTesting] = useState<boolean>(false);

  /**
   * State: Success/error messages
   * - null when no message
   * - { type: 'success' | 'error', text: string } when message exists
   * - Displayed to user as feedback
   */
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /**
   * State: Test result
   * - null when no test has been run
   * - { isValid: boolean, error?: string } after testing
   * - Used to show validation feedback
   */
  const [testResult, setTestResult] = useState<{ isValid: boolean; error?: string } | null>(null);

  // ==========================================================================
  // EFFECTS (Side Effects)
  // ==========================================================================
  
  /**
   * useEffect: Runs when component mounts (first render)
   * 
   * Purpose: Load current settings from the API
   * 
   * Empty dependency array [] means it only runs once
   */
  useEffect(() => {
    loadSettings();
  }, []); // Empty array = run only once on mount

  // ==========================================================================
  // FUNCTIONS
  // ==========================================================================
  
  /**
   * Load current settings from the API
   * 
   * This function:
   * 1. Sets loading state
   * 2. Fetches both path and status in parallel (Promise.all)
   * 3. Updates state with results
   * 4. Handles errors
   */
  const loadSettings = async () => {
    try {
      setLoading(true);
      
      // Fetch both path and status in parallel for better performance
      const [pathResponse, statusResponse] = await Promise.all([
        settingsAPI.getOneDrivePath(),
        settingsAPI.getOneDriveStatus()
      ]);

      // Update path input with current value
      if (pathResponse.success) {
        setPath(pathResponse.path || '');
      }

      // Update status display
      if (statusResponse.success) {
        setStatus(statusResponse);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      setMessage({
        type: 'error',
        text: 'Failed to load settings'
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Test the path without saving
   * 
   * This function:
   * 1. Validates input (not empty)
   * 2. Calls test API endpoint
   * 3. Shows validation result
   * 4. Updates message based on result
   */
  const handleTestPath = async () => {
    // Validate input
    if (!path.trim()) {
      setTestResult({
        isValid: false,
        error: 'Please enter a path'
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null); // Clear previous result
      
      // Call test API
      const result = await settingsAPI.testOneDrivePath(path.trim());

      // Update test result state
      setTestResult({
        isValid: result.isValid,
        error: result.error
      });

      // Show appropriate message
      if (result.isValid && result.isWritable) {
        setMessage({
          type: 'success',
          text: 'Path is valid and writable!'
        });
      } else if (result.isValid && !result.isWritable) {
        setMessage({
          type: 'error',
          text: 'Path exists but is not writable'
        });
      }
    } catch (error: any) {
      console.error('Error testing path:', error);
      setTestResult({
        isValid: false,
        error: error.response?.data?.error || 'Failed to test path'
      });
    } finally {
      setTesting(false);
    }
  };

  /**
   * Save the path to the database
   * 
   * This function:
   * 1. Prepares the path (null if empty)
   * 2. Calls save API
   * 3. Shows success/error message
   * 4. Reloads status to show updated state
   */
  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null); // Clear previous messages

      // Convert empty string to null (to clear the setting)
      const pathToSave = path.trim() === '' ? null : path.trim();
      
      // Call save API
      const result = await settingsAPI.setOneDrivePath(pathToSave);

      if (result.success) {
        // Show success message
        setMessage({
          type: 'success',
          text: result.message || 'Settings saved successfully'
        });
        
        // Reload status to show updated state
        const statusResponse = await settingsAPI.getOneDriveStatus();
        if (statusResponse.success) {
          setStatus(statusResponse);
        }
      } else {
        // Show error message
        setMessage({
          type: 'error',
          text: result.error || 'Failed to save settings'
        });
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save settings'
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clear the input field and reset test result
   */
  const handleClear = () => {
    setPath('');
    setTestResult(null);
    setMessage(null);
  };

  // ==========================================================================
  // RENDER (JSX)
  // ==========================================================================
  
  /**
   * The component returns JSX (HTML-like syntax)
   * 
   * JSX Rules:
   * - Must return a single root element (or React Fragment)
   * - Use className instead of class
   * - Use {} for JavaScript expressions
   * - Event handlers: onClick={handleSave}
   */
  return (
    <div className="settings-container">
      {/* Header Section */}
      <div className="settings-header">
        <h1>Settings</h1>
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
      </div>

      {/* Main Content */}
      <div className="settings-content">
        <div className="settings-section">
          <h2>OneDrive Integration</h2>
          <p className="settings-description">
            Configure the base folder path for OneDrive integration. This folder will be used to store
            all project folders and PDFs. The folder must exist and be writable.
          </p>

          {/* Form Section */}
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="onedrive-path">OneDrive Base Path</label>
              <input
                id="onedrive-path"
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Users\YourName\OneDrive\Projects"
                disabled={loading}
                className="form-input"
              />
              <small className="form-help">
                Enter the full path to your OneDrive folder. Leave empty to disable OneDrive integration.
              </small>
            </div>

            {/* Action Buttons */}
            <div className="form-actions">
              <button
                type="button"
                onClick={handleTestPath}
                disabled={loading || testing || !path.trim()}
                className="btn btn-secondary"
              >
                {testing ? 'Testing...' : 'Test Path'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || testing}
                className="btn btn-primary"
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading || testing}
                className="btn btn-link"
              >
                Clear
              </button>
            </div>

            {/* Test Result Display */}
            {testResult && (
              <div className={`test-result ${testResult.isValid ? 'success' : 'error'}`}>
                {testResult.isValid ? (
                  <span>✓ Path is valid and writable</span>
                ) : (
                  <span>✗ {testResult.error || 'Path is invalid'}</span>
                )}
              </div>
            )}

            {/* Message Display (Success/Error) */}
            {message && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}
          </div>

          {/* Status Display Section */}
          {status && (
            <div className="settings-status">
              <h3>Current Status</h3>
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Configured:</span>
                  <span className={`status-value ${status.configured ? 'yes' : 'no'}`}>
                    {status.configured ? 'Yes' : 'No'}
                  </span>
                </div>
                {status.configured && (
                  <>
                    <div className="status-item">
                      <span className="status-label">Path:</span>
                      <span className="status-value path">{status.path}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Valid:</span>
                      <span className={`status-value ${status.isValid ? 'yes' : 'no'}`}>
                        {status.isValid ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Writable:</span>
                      <span className={`status-value ${status.isWritable ? 'yes' : 'no'}`}>
                        {status.isWritable ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {status.error && (
                      <div className="status-item error">
                        <span className="status-label">Error:</span>
                        <span className="status-value">{status.error}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
```

### 2.3 Key Concepts Explained

**State Management:**
- `useState` creates state variables that trigger re-renders when changed
- Each state variable has a setter function (e.g., `setPath`)

**Effects:**
- `useEffect` runs side effects (API calls, subscriptions, etc.)
- Empty dependency array `[]` = run once on mount
- With dependencies `[path]` = run when `path` changes

**Event Handlers:**
- `onChange={(e) => setPath(e.target.value)}` - Updates state when input changes
- `onClick={handleSave}` - Calls function when button clicked
- `disabled={loading}` - Disables button when loading

**Conditional Rendering:**
- `{testResult && <div>...` - Only renders if `testResult` is truthy
- `{status.configured && <>...` - Only renders if path is configured

---

## Part 3: CSS Styling (`Settings.css`)

### 3.1 Styling Philosophy

**Approach:**
- Match existing design patterns from `Admin.css`
- Use consistent color scheme
- Responsive design (works on mobile and desktop)
- Clear visual hierarchy
- Accessible (good contrast, readable fonts)

### 3.2 Complete CSS with Explanations

**Location:** `client/src/components/admin/Settings.css`

```css
/**
 * ============================================================================
 * SETTINGS PAGE STYLES
 * ============================================================================
 * 
 * This CSS file styles the Settings component.
 * It follows the same patterns as Admin.css for consistency.
 */

/* ============================================================================
 * CONTAINER & LAYOUT
 * ============================================================================ */

/**
 * Main container for the settings page
 * - Matches admin-page pattern from Admin.css
 * - Full viewport height with padding
 * - Light gray background
 */
.settings-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px;
}

/**
 * Header section with title and back button
 * - Flexbox layout for horizontal alignment
 * - Space between title and button
 */
.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.settings-header h1 {
  margin: 0;
  color: #333;
}

/**
 * Back button styling
 * - Matches back-button from Admin.css
 * - Gray background, white text
 * - Hover effect for interactivity
 */
.btn-back {
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-back:hover {
  background: #e9e9e9;
}

/* ============================================================================
 * CONTENT SECTION
 * ============================================================================ */

/**
 * Main content container
 * - White background with shadow
 * - Rounded corners
 * - Max width for readability
 * - Padding for spacing
 */
.settings-content {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/**
 * Section within content
 * - Spacing between sections
 */
.settings-section {
  margin-bottom: 30px;
}

.settings-section h2 {
  margin-top: 0;
  color: #333;
  border-bottom: 2px solid #007bff;
  padding-bottom: 10px;
}

/**
 * Description text
 * - Gray color for secondary information
 * - Line height for readability
 */
.settings-description {
  color: #666;
  margin-bottom: 20px;
  line-height: 1.6;
}

/* ============================================================================
 * FORM STYLES
 * ============================================================================ */

.settings-form {
  margin-bottom: 30px;
}

/**
 * Form group (label + input)
 * - Vertical spacing between groups
 */
.form-group {
  margin-bottom: 20px;
}

/**
 * Label styling
 * - Bold for emphasis
 * - Dark color for readability
 * - Bottom margin for spacing
 */
.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
}

/**
 * Input field styling
 * - Full width
 * - Padding for comfortable typing
 * - Border and border radius
 * - Focus state for accessibility
 */
.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

/**
 * Focus state
 * - Blue border when focused
 * - Subtle shadow for depth
 */
.form-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

/**
 * Disabled state
 * - Gray background
 * - Not-allowed cursor
 */
.form-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

/**
 * Help text below input
 * - Smaller font
 * - Gray color
 */
.form-help {
  display: block;
  margin-top: 5px;
  color: #666;
  font-size: 12px;
}

/* ============================================================================
 * BUTTON STYLES
 * ============================================================================ */

/**
 * Button container
 * - Flexbox for horizontal layout
 * - Gap between buttons
 */
.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap; /* Wrap on small screens */
}

/**
 * Base button styles
 * - Padding for clickable area
 * - Border radius for modern look
 * - Cursor pointer
 * - Transition for smooth hover
 */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

/**
 * Disabled state
 * - Reduced opacity
 * - Not-allowed cursor
 */
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/**
 * Primary button (Save)
 * - Blue background
 * - White text
 * - Darker on hover
 */
.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

/**
 * Secondary button (Test)
 * - Gray background
 * - White text
 */
.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

/**
 * Link button (Clear)
 * - Transparent background
 * - Blue text
 * - Underline on hover
 */
.btn-link {
  background: transparent;
  color: #007bff;
  text-decoration: underline;
}

.btn-link:hover:not(:disabled) {
  color: #0056b3;
}

/* ============================================================================
 * MESSAGE & FEEDBACK STYLES
 * ============================================================================ */

/**
 * Test result display
 * - Success: Green background
 * - Error: Red background
 * - Padding and border for visibility
 */
.test-result {
  margin-top: 15px;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
}

.test-result.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.test-result.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/**
 * General message display
 * - Used for success/error messages
 * - Similar styling to test-result
 */
.message {
  margin-top: 15px;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/* ============================================================================
 * STATUS DISPLAY
 * ============================================================================ */

.settings-status {
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid #eee;
}

.settings-status h3 {
  margin-top: 0;
  color: #333;
}

/**
 * Status grid
 * - Responsive grid layout
 * - Auto-fit columns (adjusts to screen size)
 * - Gap between items
 */
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

/**
 * Status item
 * - Light gray background
 * - Padding for spacing
 * - Rounded corners
 */
.status-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
}

/**
 * Error status item
 * - Spans full width
 * - Yellow background for warning
 */
.status-item.error {
  grid-column: 1 / -1;
  background: #fff3cd;
}

/**
 * Status label
 * - Small, uppercase text
 * - Gray color
 * - Spacing below
 */
.status-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/**
 * Status value
 * - Larger, bold text
 * - Color varies by state
 */
.status-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.status-value.yes {
  color: #28a745; /* Green for positive */
}

.status-value.no {
  color: #dc3545; /* Red for negative */
}

.status-value.path {
  font-family: monospace; /* Monospace for paths */
  word-break: break-all; /* Break long paths */
  color: #007bff; /* Blue for path */
}

/* ============================================================================
 * RESPONSIVE DESIGN
 * ============================================================================ */

/**
 * Mobile adjustments
 * - Smaller padding on small screens
 * - Stack buttons vertically if needed
 */
@media (max-width: 768px) {
  .settings-container {
    padding: 10px;
  }

  .settings-content {
    padding: 20px;
  }

  .form-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }

  .status-grid {
    grid-template-columns: 1fr; /* Single column on mobile */
  }
}
```

### 3.3 CSS Concepts Explained

**CSS Selectors:**
- `.settings-container` - Targets elements with class "settings-container"
- `.btn:hover` - Targets .btn when hovered
- `.form-input:focus` - Targets .form-input when focused
- `.status-value.yes` - Targets .status-value that also has class "yes"

**Flexbox:**
- `display: flex` - Creates flexible layout
- `justify-content: space-between` - Pushes items to edges
- `gap: 10px` - Space between flex items

**Grid:**
- `display: grid` - Creates grid layout
- `grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))` - Responsive columns
- `gap: 15px` - Space between grid items

**Responsive Design:**
- `@media (max-width: 768px)` - Styles for screens smaller than 768px
- Adjusts layout for mobile devices

---

## Part 4: Integration Steps

### 4.1 Add Route to App.tsx

**File:** `client/src/App.tsx`

Add the Settings route (lazy-loaded like other admin components):

```typescript
// Add to imports at top
const Settings = lazy(() => import('./components/admin/Settings'));

// Add route in Routes section (after other admin routes)
<Route
  path="/admin/settings"
  element={
    <ProtectedRoute requireAdmin>
      <Suspense fallback={<LoadingSpinner fullScreen message="Loading settings..." />}>
        <Settings />
      </Suspense>
    </ProtectedRoute>
  }
/>
```

### 4.2 Add Navigation Link

**File:** `client/src/components/Dashboard.tsx` or admin navigation component

Add a link to Settings:

```typescript
<Link to="/admin/settings" className="nav-link">
  ⚙️ Settings
</Link>
```

---

## Part 5: Testing Checklist

### 5.1 Component Testing

- [ ] Component renders without errors
- [ ] Settings load on mount
- [ ] Input field updates when typing
- [ ] Test button validates path
- [ ] Save button saves path
- [ ] Clear button clears input
- [ ] Status section displays correctly
- [ ] Error messages show correctly
- [ ] Success messages show correctly
- [ ] Loading states work (buttons disabled)
- [ ] Back button navigates to dashboard

### 5.2 API Integration Testing

- [ ] Get path API works
- [ ] Set path API works
- [ ] Test path API works
- [ ] Get status API works
- [ ] Error handling works (network errors, validation errors)
- [ ] Authentication works (redirects if not logged in)
- [ ] Admin-only access works (non-admin can't access)

### 5.3 UI/UX Testing

- [ ] Responsive on mobile
- [ ] Responsive on tablet
- [ ] Responsive on desktop
- [ ] Colors are accessible (good contrast)
- [ ] Buttons are clickable (good size)
- [ ] Text is readable
- [ ] Loading states are clear
- [ ] Error messages are helpful

---

## Summary

**Three Files to Create:**

1. **`client/src/api/settings.ts`**
   - TypeScript API client
   - Type-safe functions for API calls
   - Follows existing patterns

2. **`client/src/components/admin/Settings.tsx`**
   - React component
   - State management with hooks
   - User interactions and feedback
   - Error handling

3. **`client/src/components/admin/Settings.css`**
   - Styling
   - Matches existing design
   - Responsive layout
   - Accessible colors

**Integration:**
- Add route to `App.tsx`
- Add navigation link
- Test thoroughly

This completes the frontend implementation for Phase 1!

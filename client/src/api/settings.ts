import api from './api';

/**
 * Response when getting the OneDrive path
 */
export interface OneDrivePathResponse {
  success: boolean;
  path: string | null;
  configured: boolean;
}

/**
 * Response when getting the status of OneDrive path
 * Includes validation information
 */
export interface OneDriveStatusResponse {
  success: boolean;
  configured: boolean;
  path?: string;
  isValid?: boolean;
  isWritable?: boolean;
  error?: string;
}

/**
 * Response when testing a path (without saving)
 */
export interface OneDriveTestResponse {
  success: boolean;
  isValid: boolean;
  isWritable?: boolean;
  error?: string;
}

/**
 * Request body when setting the OneDrive path
 */
export interface SetOneDrivePathRequest {
  path: string | null;
}

/**
 * Response when setting the OneDrive path
 */
export interface SetOneDrivePathResponse {
  success: boolean;
  message?: string;
  path?: string | null;
  error?: string;
}

/**
 * API Client for Settings
 * Provides type-safe functions to interact with the settings API
 */
export const settingsAPI = {
  /**
   * Get the current OneDrive base path
   * 
   * API Endpoint: GET /api/settings/onedrive-path
   */
  getOneDrivePath: async (): Promise<OneDrivePathResponse> => {
    const response = await api.get<OneDrivePathResponse>('/settings/onedrive-path');
    return response.data;
  },

  /**
   * Set or update the OneDrive base path
   * 
   * API Endpoint: POST /api/settings/onedrive-path
   * Body: { path: string | null }
   * 
   * @param path - The path to set, or null to clear
   */
  setOneDrivePath: async (path: string | null): Promise<SetOneDrivePathResponse> => {
    const response = await api.post<SetOneDrivePathResponse>(
      '/settings/onedrive-path',
      { path }
    );
    return response.data;
  },

  /**
   * Get the status of the OneDrive path
   * Includes validation information (is it valid? is it writable?)
   * 
   * API Endpoint: GET /api/settings/onedrive-status
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
   * @param path - The path to test
   */
  testOneDrivePath: async (path: string): Promise<OneDriveTestResponse> => {
    const response = await api.post<OneDriveTestResponse>(
      '/settings/onedrive-test',
      { path }
    );
    return response.data;
  },
};

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
 * Response when getting the workflow path
 */
export interface WorkflowPathResponse {
  success: boolean;
  path: string | null;
}

/**
 * Response when getting the status of workflow path
 */
export interface WorkflowStatusResponse {
  success: boolean;
  configured: boolean;
  path?: string;
  isValid?: boolean;
  isWritable?: boolean;
  error?: string;
}

/**
 * Response when testing a workflow path
 */
export interface WorkflowTestResponse {
  success: boolean;
  isValid: boolean;
  isWritable?: boolean;
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

  /**
   * Get the current workflow base path
   * 
   * API Endpoint: GET /api/settings/workflow/path
   */
  getWorkflowPath: async (): Promise<WorkflowPathResponse> => {
    const response = await api.get<WorkflowPathResponse>('/settings/workflow/path');
    return response.data;
  },

  /**
   * Set or update the workflow base path
   * 
   * API Endpoint: POST /api/settings/workflow/path
   * Body: { path: string | null }
   * 
   * @param path - The path to set, or null to clear
   */
  setWorkflowPath: async (path: string | null): Promise<SetOneDrivePathResponse> => {
    const response = await api.post<SetOneDrivePathResponse>(
      '/settings/workflow/path',
      { path }
    );
    return response.data;
  },

  /**
   * Get the status of the workflow path
   * Includes validation information (is it valid? is it writable?)
   * 
   * API Endpoint: GET /api/settings/workflow/status
   */
  getWorkflowStatus: async (): Promise<WorkflowStatusResponse> => {
    const response = await api.get<WorkflowStatusResponse>('/settings/workflow/status');
    return response.data;
  },

  /**
   * Test a workflow path without saving it
   * Useful for validating user input before saving
   * 
   * API Endpoint: POST /api/settings/workflow/path/test
   * Body: { path: string }
   * 
   * @param path - The path to test
   */
  testWorkflowPath: async (path: string): Promise<WorkflowTestResponse> => {
    const response = await api.post<WorkflowTestResponse>(
      '/settings/workflow/path/test',
      { path }
    );
    return response.data;
  },

  /**
   * Get auto-send approved reports nightly setting for current tenant.
   * API: GET /api/settings/auto-send
   */
  getAutoSendEnabled: async (): Promise<{ success: boolean; enabled: boolean }> => {
    const response = await api.get<{ success: boolean; enabled: boolean }>('/settings/auto-send');
    return response.data;
  },

  /**
   * Set auto-send enabled/disabled for current tenant.
   * API: PATCH /api/settings/auto-send
   */
  setAutoSendEnabled: async (enabled: boolean): Promise<{ success: boolean; enabled: boolean }> => {
    const response = await api.patch<{ success: boolean; enabled: boolean }>('/settings/auto-send', { enabled });
    return response.data;
  },

  /**
   * Get the email body template for auto-sent approved reports.
   * API: GET /api/settings/auto-send-body
   */
  getAutoSendBodyTemplate: async (): Promise<{ success: boolean; bodyTemplate: string }> => {
    const response = await api.get<{ success: boolean; bodyTemplate: string }>('/settings/auto-send-body');
    return response.data;
  },

  /**
   * Update the email body template for auto-sent approved reports.
   * API: PATCH /api/settings/auto-send-body
   */
  setAutoSendBodyTemplate: async (bodyTemplate: string): Promise<{ success: boolean; bodyTemplate: string }> => {
    const response = await api.patch<{ success: boolean; bodyTemplate: string }>('/settings/auto-send-body', {
      bodyTemplate
    });
    return response.data;
  }
};

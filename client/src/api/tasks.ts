import api from './api';

export type TaskType = 
  | 'DENSITY_MEASUREMENT'
  | 'PROCTOR'
  | 'REBAR'
  | 'COMPRESSIVE_STRENGTH'
  | 'CYLINDER_PICKUP';

export type TaskStatus = 
  | 'ASSIGNED'
  | 'IN_PROGRESS_TECH'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED_NEEDS_FIX';

/** Present on approve responses (Supabase) when the server generates/stores the report PDF. */
export interface ApprovalPdfResult {
  success?: boolean;
  skipped?: boolean;
  taskType?: string;
  saved?: boolean;
  savedPath?: string | null;
  fileName?: string | null;
  saveError?: string | null;
  error?: string;
}

export interface Task {
  id: number;
  projectId: number;
  taskType: TaskType;
  status: TaskStatus;
  assignedTechnicianId?: number;
  assignedTechnicianName?: string;
  assignedTechnicianEmail?: string;
  dueDate?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  locationName?: string;
  locationNotes?: string;
  engagementNotes?: string;
  rejectionRemarks?: string;
  resubmissionDueDate?: string;
  // PM review fields (snake_case in API responses)
  pm_review_status?: 'NOT_STARTED' | 'REVIEWING' | 'COMPLETED' | string;
  pm_review_started_at?: string;
  pm_review_completed_at?: string;
  pm_reviewer_user_id?: number;
  fieldCompleted?: number;
  fieldCompletedAt?: string;
  reportSubmitted?: number;
  lastEditedByUserId?: number;
  lastEditedByRole?: string;
  lastEditedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  projectNumber?: string;
  projectName?: string;
  proctorNo?: number;
  /** Per project + task type; 1 = unnumbered label, 2+ = "Rebar 2", etc. */
  workflowInstanceNo?: number | null;
  pdf?: ApprovalPdfResult | null;
}

export interface ProctorTask {
  id: number;
  proctorNo: number;
  status: TaskStatus;
}

export interface CreateTaskRequest {
  projectId: number;
  taskType: TaskType;
  assignedTechnicianId?: number;
  dueDate?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  locationName?: string;
  locationNotes?: string;
  engagementNotes?: string;
}

export interface UpdateTaskRequest {
  assignedTechnicianId?: number;
  dueDate?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  locationName?: string;
  locationNotes?: string;
  engagementNotes?: string;
  taskType?: TaskType;
}

export interface RejectTaskRequest {
  rejectionRemarks: string;
  resubmissionDueDate: string;
}

export interface TaskHistoryEntry {
  id: number;
  taskId: number;
  timestamp: string;
  actorRole: string;
  actorName: string;
  actorUserId?: number;
  actionType: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REASSIGNED' | 'STATUS_CHANGED';
  note?: string;
}

const taskTypeLabels: { [key in TaskType]: string } = {
  DENSITY_MEASUREMENT: 'Density Measurement',
  PROCTOR: 'Proctor',
  REBAR: 'Rebar',
  COMPRESSIVE_STRENGTH: 'Compressive Strength',
  CYLINDER_PICKUP: 'Cylinder Pickup',
};

export const taskTypeLabel = (taskTypeOrTask: TaskType | Task): string => {
  // Support both old signature (taskType) and new signature (Task object)
  if (typeof taskTypeOrTask === 'string') {
    return taskTypeLabels[taskTypeOrTask] || taskTypeOrTask;
  }
  
  // New signature: Task object
  const task = taskTypeOrTask;
  const baseLabel = taskTypeLabels[task.taskType] || task.taskType;
  
  // For Proctor tasks, append the proctor number if available
  if (task.taskType === 'PROCTOR' && task.proctorNo) {
    return `${baseLabel} ${task.proctorNo}`;
  }

  const raw = task as Task & { workflow_instance_no?: number };
  const workflowInst = task.workflowInstanceNo ?? raw.workflow_instance_no;
  if (workflowInst != null && workflowInst > 1) {
    return `${baseLabel} ${workflowInst}`;
  }

  return baseLabel;
};

export const tasksAPI = {
  create: async (data: CreateTaskRequest): Promise<Task> => {
    const response = await api.post<Task>('/tasks', data);
    return response.data;
  },

  list: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>('/tasks');
    return response.data;
  },

  getByProject: async (projectId: number): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/project/${projectId}`);
    return response.data;
  },

  get: async (id: number): Promise<Task> => {
    const response = await api.get<Task>(`/tasks/${id}`);
    return response.data;
  },

  update: async (id: number, data: UpdateTaskRequest): Promise<Task> => {
    const response = await api.put<Task>(`/tasks/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<{ success: boolean }> => {
    const response = await api.delete<{ success: boolean }>(`/tasks/${id}`);
    return response.data;
  },

  updateStatus: async (id: number, status: TaskStatus): Promise<Task> => {
    const response = await api.put<Task>(`/tasks/${id}/status`, { status });
    return response.data;
  },

  approve: async (id: number): Promise<Task> => {
    const response = await api.post<Task>(`/tasks/${id}/approve`);
    return response.data;
  },

  reject: async (id: number, data: RejectTaskRequest): Promise<Task> => {
    const response = await api.post<Task>(`/tasks/${id}/reject`, data);
    return response.data;
  },

  bulkApprove: async (ids: number[]): Promise<{
    success: boolean;
    totals: {
      requested: number;
      approved: number;
      skippedWrongStatus: number;
      notFound: number;
      forbidden: number;
      errors: number;
    };
    results: Array<{
      id: number;
      status: string;
      currentStatus?: TaskStatus;
      error?: string;
      pdf?: ApprovalPdfResult | null;
    }>;
  }> => {
    const response = await api.post(`/tasks/bulk-approve`, { ids });
    return response.data;
  },

  // Dashboard filters
  getToday: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/dashboard/today?_=${Date.now()}`);
    return response.data;
  },

  getUpcoming: async (days: number = 7): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/dashboard/upcoming?days=${days}&_=${Date.now()}`);
    return response.data;
  },

  getOverdue: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>('/tasks/dashboard/overdue');
    return response.data;
  },

  getActivity: async (date: string): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/dashboard/activity?date=${date}`);
    return response.data;
  },

  getHistory: async (taskId: number): Promise<TaskHistoryEntry[]> => {
    const response = await api.get<TaskHistoryEntry[]>(`/tasks/${taskId}/history`);
    return response.data;
  },

  // Technician dashboard views (filtered by assigned technician)
  getTechnicianToday: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/dashboard/technician/today?_=${Date.now()}`);
    return response.data;
  },

  getTechnicianUpcoming: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/dashboard/technician/upcoming?_=${Date.now()}`);
    return response.data;
  },

  getTechnicianActivity: async (date: string): Promise<any[]> => {
    const response = await api.get<any[]>(`/tasks/dashboard/technician/activity?date=${date}`);
    return response.data;
  },

  // Tomorrow and Open Reports views
  getTechnicianTomorrow: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/dashboard/technician/tomorrow?_=${Date.now()}`);
    return response.data;
  },

  getTechnicianOpenReports: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>(`/tasks/dashboard/technician/open-reports?_=${Date.now()}`);
    return response.data;
  },

  markFieldComplete: async (taskId: number): Promise<Task> => {
    const response = await api.post<Task>(`/tasks/${taskId}/mark-field-complete`);
    return response.data;
  },

  // Get Proctor tasks for a project (for Density form dropdown)
  getProctorsForProject: async (projectId: number): Promise<ProctorTask[]> => {
    const response = await api.get<ProctorTask[]>(`/tasks/project/${projectId}/proctors`);
    return response.data;
  },
};


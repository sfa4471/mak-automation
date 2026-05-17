import { useCallback, useState } from 'react';
import { tasksAPI, Task, taskTypeLabel } from '../api/tasks';

export function useUnapproveReport(task: Task | null, onSuccess: () => void | Promise<void>) {
  const [unapproveOpen, setUnapproveOpen] = useState(false);
  const [alreadySentToClient, setAlreadySentToClient] = useState(false);
  const [unapproveLoading, setUnapproveLoading] = useState(false);

  const openUnapproveModal = useCallback(async () => {
    if (!task) return;
    setUnapproveLoading(true);
    try {
      const ctx = await tasksAPI.getUnapproveContext(task.id);
      if (!ctx.canUnapprove) {
        throw new Error('This report is not in approved status.');
      }
      setAlreadySentToClient(ctx.alreadySentToClient);
      setUnapproveOpen(true);
    } finally {
      setUnapproveLoading(false);
    }
  }, [task]);

  const closeUnapproveModal = useCallback(() => {
    setUnapproveOpen(false);
    setAlreadySentToClient(false);
  }, []);

  const submitUnapprove = useCallback(
    async (payload: { note: string }) => {
      if (!task) return;
      await tasksAPI.unapprove(task.id, payload);
      closeUnapproveModal();
      await onSuccess();
    },
    [task, closeUnapproveModal, onSuccess]
  );

  const contextLine = task
    ? `${task.projectNumber ?? '—'} · ${taskTypeLabel(task)}`
    : undefined;

  return {
    unapproveOpen,
    alreadySentToClient,
    unapproveLoading,
    openUnapproveModal,
    closeUnapproveModal,
    submitUnapprove,
    contextLine
  };
}

import React, { useEffect, useState } from 'react';
import './RejectTaskModal.css';

export interface RejectTaskPayload {
  rejectionRemarks: string;
  resubmissionDueDate: string;
}

interface RejectTaskModalProps {
  isOpen: boolean;
  contextLine?: string;
  onClose: () => void;
  onSubmit: (payload: RejectTaskPayload) => Promise<void>;
}

const RejectTaskModal: React.FC<RejectTaskModalProps> = ({
  isOpen,
  contextLine,
  onClose,
  onSubmit
}) => {
  const [remarks, setRemarks] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRemarks('');
      setDueDate('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = remarks.trim();
    if (!trimmed) {
      setError('Please enter feedback for the technician.');
      return;
    }
    if (!dueDate) {
      setError('Please choose a resubmission due date.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        rejectionRemarks: trimmed,
        resubmissionDueDate: dueDate
      });
      onClose();
    } catch (err: any) {
      const data = err?.response?.data;
      const fromValidator =
        Array.isArray(data?.errors) && data.errors.length > 0
          ? data.errors.map((x: { msg?: string }) => x.msg).filter(Boolean).join(' ')
          : null;
      setError(
        data?.error ||
          fromValidator ||
          err?.message ||
          'Unable to record the rejection. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="reject-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="reject-modal"
        role="dialog"
        aria-labelledby="reject-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reject-modal-title" className="reject-modal-title">
          Request revision from technician
        </h2>
        <p className="reject-modal-intro">
          The report will be returned for corrections. The technician will see your feedback and the
          new due date you set below.
        </p>
        {contextLine ? <p className="reject-modal-context">{contextLine}</p> : null}

        <form onSubmit={handleSubmit}>
          <label className="reject-modal-label" htmlFor="reject-remarks">
            Feedback for technician <span className="reject-required">(required)</span>
          </label>
          <textarea
            id="reject-remarks"
            className="reject-modal-textarea"
            rows={5}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Describe what needs to be corrected or clarified…"
            disabled={submitting}
          />

          <label className="reject-modal-label" htmlFor="reject-due-date">
            Resubmission due date <span className="reject-required">(required)</span>
          </label>
          <input
            id="reject-due-date"
            type="date"
            className="reject-modal-date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={submitting}
          />

          {error ? <div className="reject-modal-error" role="alert">{error}</div> : null}

          <div className="reject-modal-actions">
            <button
              type="button"
              className="reject-modal-btn reject-modal-btn-secondary"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="reject-modal-btn reject-modal-btn-danger"
              disabled={submitting}
            >
              {submitting ? 'Recording…' : 'Return report for revision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RejectTaskModal;

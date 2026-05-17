import React, { useEffect, useState } from 'react';
import './RejectTaskModal.css';

export interface UnapproveTaskPayload {
  note: string;
}

interface UnapproveTaskModalProps {
  isOpen: boolean;
  contextLine?: string;
  alreadySentToClient?: boolean;
  onClose: () => void;
  onSubmit: (payload: UnapproveTaskPayload) => Promise<void>;
}

const UnapproveTaskModal: React.FC<UnapproveTaskModalProps> = ({
  isOpen,
  contextLine,
  alreadySentToClient = false,
  onClose,
  onSubmit
}) => {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNote('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setError('Please enter a reason for unapproving this report.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ note: trimmed });
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
          'Unable to unapprove the report. Please try again.'
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
        aria-modal="true"
        aria-labelledby="unapprove-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="unapprove-modal-title" className="reject-modal-title">
          Unapprove report
        </h2>
        <p className="reject-modal-intro">
          The report will return to review. You can edit it and approve again when ready.
        </p>
        {contextLine ? <p className="reject-modal-context">{contextLine}</p> : null}
        {alreadySentToClient ? (
          <p
            className="reject-modal-intro"
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: 6,
              color: '#664d03'
            }}
          >
            This approved report has already been sent to the client. Unapproving will not recall
            that email.
          </p>
        ) : null}

        <form onSubmit={handleSubmit}>
          <label className="reject-modal-label" htmlFor="unapprove-reason">
            Reason for unapproving <span className="reject-required">(required)</span>
          </label>
          <textarea
            id="unapprove-reason"
            className="reject-modal-textarea"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe what needs to be corrected…"
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
              {submitting ? 'Unapproving…' : 'Unapprove report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UnapproveTaskModal;
import React, { createContext, useCallback, useContext, useState } from 'react';
import './AppDialogContext.css';

type DialogPayload = {
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  resolve: (value?: boolean) => void;
};

type AppDialogContextValue = {
  showAlert: (message: string, title?: string) => Promise<void>;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function useAppDialog(): AppDialogContextValue {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    return {
      showAlert: async (message: string) => {
        window.alert(message);
      },
      showConfirm: async (message: string) => window.confirm(message),
    };
  }
  return ctx;
}

export const AppDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogPayload | null>(null);

  const showAlert = useCallback((message: string, title = 'Notice') => {
    return new Promise<void>((resolve) => {
      setDialog({
        type: 'alert',
        title,
        message,
        resolve: () => {
          setDialog(null);
          resolve();
        },
      });
    });
  }, []);

  const showConfirm = useCallback((message: string, title = 'Please confirm') => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        type: 'confirm',
        title,
        message,
        resolve: (v) => {
          setDialog(null);
          resolve(!!v);
        },
      });
    });
  }, []);

  const close = () => {
    if (!dialog) return;
    if (dialog.type === 'confirm') {
      dialog.resolve(false);
    } else {
      dialog.resolve();
    }
  };

  return (
    <AppDialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div
          className="app-dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="app-dialog-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="app-dialog-title" className="app-dialog-title">
              {dialog.title}
            </h2>
            <div className="app-dialog-message">{dialog.message}</div>
            <div className="app-dialog-actions">
              {dialog.type === 'confirm' && (
                <button type="button" className="app-dialog-btn app-dialog-btn-secondary" onClick={() => dialog.resolve(false)}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="app-dialog-btn app-dialog-btn-primary"
                onClick={() => (dialog.type === 'confirm' ? dialog.resolve(true) : dialog.resolve())}
              >
                {dialog.type === 'confirm' ? 'Continue' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppDialogContext.Provider>
  );
};

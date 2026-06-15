import api from './api';

export interface QboStatus {
  connected: boolean;
  realmId?: string;
  connectedAt?: string;
  tokenExpiry?: string;
}

export async function getQboStatus(): Promise<QboStatus> {
  const { data } = await api.get('/qbo/status');
  return data;
}

/** Returns the Intuit OAuth URL — caller should do window.location.href = url */
export async function getQboConnectUrl(): Promise<{ url: string }> {
  const { data } = await api.get('/qbo/connect');
  return data;
}

export async function disconnectQbo(): Promise<void> {
  await api.delete('/qbo/disconnect');
}

export async function pushInvoiceToQbo(
  invoiceId: number,
): Promise<{ qboInvoiceId: string; qboInvoiceNumber: string }> {
  const { data } = await api.post(`/qbo/invoices/${invoiceId}/push`);
  return data;
}

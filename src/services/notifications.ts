export type ReminderType = 'payment' | 'renewal';

export interface NotificationRecord {
  id: string;
  type: ReminderType;
  recipient: string;
  message: string;
  sentAt: string;
  status: 'queued' | 'sent';
  channel: 'sms' | 'email' | 'telegram';
}

const notificationHistory: NotificationRecord[] = [];

export function getNotificationHistory(): NotificationRecord[] {
  return [...notificationHistory];
}

export function sendPaymentReminder(studentName: string, dueDate: string, amount: number): NotificationRecord {
  const record: NotificationRecord = {
    id: `${Date.now()}-payment`,
    type: 'payment',
    recipient: studentName,
    message: `Payment reminder for ${studentName}: ${amount} so'm is due on ${dueDate}.`,
    sentAt: new Date().toISOString(),
    status: 'sent',
    channel: 'sms',
  };

  notificationHistory.unshift(record);
  return record;
}

export function sendRenewalReminder(studentName: string, groupName: string, dueDate: string, amount: number): NotificationRecord {
  const record: NotificationRecord = {
    id: `${Date.now()}-renewal`,
    type: 'renewal',
    recipient: studentName,
    message: `Renewal reminder for ${groupName}: ${studentName} should renew ${amount} so'm by ${dueDate}.`,
    sentAt: new Date().toISOString(),
    status: 'sent',
    channel: 'telegram',
  };

  notificationHistory.unshift(record);
  return record;
}

export function hasRecentDuplicateNotification(key: string): boolean {
  const found = notificationHistory.find((item) => item.id.includes(key));
  return Boolean(found);
}

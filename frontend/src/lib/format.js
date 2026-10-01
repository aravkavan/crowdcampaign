const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dayTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const formatDate = (value) => day.format(new Date(value));
export const formatDateTime = (value) => dayTime.format(new Date(value));

export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export function timeLeft(deadline, now = Date.now()) {
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return 'Deadline passed';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Closes within the hour';
  if (hours < 48) return `${plural(hours, 'hour')} left`;
  return `${plural(Math.floor(hours / 24), 'day')} left`;
}

export const STATUS_LABELS = { open: 'Open', judging: 'Judging', winner_selected: 'Winner picked' };

export function initials(name = '') {
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function judgeName(method = '') {
  if (method.startsWith('anthropic')) return 'Scored by Claude';
  if (method.startsWith('gemini')) return 'Scored by Gemini';
  return 'Offline estimate, not AI';
}

// Toast Notification System
let toastId = 0;

export const toast = (msg, type = 'info', dur = 3500) => {
  const icons = { 
    success: '✅', 
    error: '❌', 
    warning: '⚠️', 
    info: 'ℹ️' 
  };
  
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const id = `toast-${toastId++}`;
  const t = document.createElement('div');
  t.id = id;
  t.className = `toast ${type}`;
  t.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close" onclick="document.getElementById('${id}').remove()">×</button>
  `;
  
  container.appendChild(t);
  
  setTimeout(() => {
    t.style.animation = 'slideOut .3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, dur);
};

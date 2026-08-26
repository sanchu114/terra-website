const ALLOWED_EVENTS = new Set([
  'view_booking',
  'search_availability',
  'quote_available',
  'quote_unavailable',
  'quote_out_of_range',
  'quote_error',
  'start_booking_request',
  'submit_booking_request',
  'booking_request_error',
  'booking_request_success',
  'pantry_interest',
  'click_contact',
  'click_ota',
]);

export const track = (eventName, parameters = {}) => {
  if (!ALLOWED_EVENTS.has(eventName)) return;
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, parameters);
  }
};

export const getGaClientId = () => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    resolve(null);
    return;
  }
  window.gtag('get', 'G-K26L6NB3MK', 'client_id', (clientId) => resolve(clientId || null));
  window.setTimeout(() => resolve(null), 800);
});

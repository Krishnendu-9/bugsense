import userEvent from '@testing-library/user-event';

/*
 * The one way tests get a user-event instance.
 *
 * delay: null -- user-event's default (delay: 0) still awaits a setTimeout
 * after every keystroke, which on Windows is ~10-16ms each: a 54-character
 * form fill spent ~0.6s waiting on timers and nothing else. null skips the
 * wait entirely; the events and their order are unchanged.
 */
export const setupUser = (options = {}) => userEvent.setup({ delay: null, ...options });

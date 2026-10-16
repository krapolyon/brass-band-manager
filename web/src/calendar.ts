import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';

// The personal calendar address of the member (model/members.md, "Calendar
// address"): a calendar app subscribes to it, and reads the gigs the member
// comes to. The app writes into nobody's calendar.

type CalendarState = { token: string | null };

const QUERY_KEY = ['calendar'];

export function useCalendar() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: () => api<CalendarState>('/api/me/calendar') });
}

/** The address of the feed: https for copying, webcal for the Calendar app of an Apple device. */
export function feedAddress(token: string, scheme: 'https' | 'webcal'): string {
  const path = `/api/calendar/${token}.ics`;
  return scheme === 'webcal'
    ? `webcal://${window.location.host}${path}`
    : `${window.location.origin}${path}`;
}

/**
 * Which way the screen offers: an iPhone, an iPad or a Mac subscribes from
 * its Calendar app with the webcal address; Android and Windows copy the
 * address for Google Agenda, which subscribes from a computer only. When
 * unsure, the second.
 */
export function calendarPlatform(): 'apple' | 'other' {
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? 'apple' : 'other';
}

/** Creating the address when there is none, and replacing it. Both answer the token. */
export function useCalendarAddress() {
  const queryClient = useQueryClient();
  const keep = (state: CalendarState) => {
    queryClient.setQueryData(QUERY_KEY, state);
    return state.token ?? '';
  };
  return {
    /** The token there is, created when there is none. */
    ensure: async (): Promise<string> => {
      const known = queryClient.getQueryData<CalendarState>(QUERY_KEY)?.token;
      return known ?? keep(await api<CalendarState>('/api/me/calendar', { method: 'POST' }));
    },
    /** A new token: the old address answers nothing from now on. */
    reset: async (): Promise<string> =>
      keep(await api<CalendarState>('/api/me/calendar', { method: 'PUT' })),
  };
}

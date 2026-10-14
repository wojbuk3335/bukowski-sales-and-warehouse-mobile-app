// Komunikaty blokady „jedna osoba na punkcie” pokazywane na ekranie logowania.

// Ogólny komunikat, gdy backend nie przesłał szczegółów aktywnej sesji
export const GENERIC_SESSION_ACTIVE_MESSAGE =
    '⚠️ Ktoś jest już zalogowany na tym koncie. Wyloguj się z innego urządzenia, aby kontynuować.';

// Pokazywany po przekierowaniu na logowanie z params { reason: 'SESSION_REVOKED' }
export const SESSION_REVOKED_MESSAGE =
    'Zostałeś wylogowany — zalogowano na innym urządzeniu lub administrator zakończył sesję.';

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const pad = (number) => String(number).padStart(2, '0');

// Godzina w czasie lokalnym telefonu (HH:MM)
export const formatClock = (value) => {
    const date = parseDate(value);
    if (!date) return null;
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// „przed chwilą” / „X min temu” / „X godz. temu”
export const formatTimeAgo = (value, now = Date.now()) => {
    const date = parseDate(value);
    if (!date) return null;

    const diffMs = Math.max(0, now - date.getTime());
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'przed chwilą';
    if (minutes < 60) return `${minutes} min temu`;
    return `${Math.floor(minutes / 60)} godz. temu`;
};

// Komunikat 403 SESSION_ACTIVE: kto (nazwa urządzenia), od kiedy i kiedy ostatnio był aktywny.
// session = { startedAt (ISO), lastSeenAt (ISO), deviceName }
export const buildSessionActiveMessage = (session, now = Date.now()) => {
    if (!session || typeof session !== 'object') return GENERIC_SESSION_ACTIVE_MESSAGE;

    const details = [];
    if (typeof session.deviceName === 'string' && session.deviceName.trim()) {
        details.push(session.deviceName.trim());
    }
    const startedAt = formatClock(session.startedAt);
    if (startedAt) details.push(`od ${startedAt}`);
    const lastSeen = formatTimeAgo(session.lastSeenAt, now);
    if (lastSeen) details.push(`ostatnia aktywność ${lastSeen}`);

    if (details.length === 0) return GENERIC_SESSION_ACTIVE_MESSAGE;

    return `Na tym punkcie jest już zalogowany inny telefon (${details.join(', ')}). ` +
        'Poproś tę osobę o wylogowanie albo administratora o wylogowanie z panelu.';
};

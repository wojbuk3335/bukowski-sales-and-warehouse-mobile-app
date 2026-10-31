// Blokada aplikacji przy szybkim logowaniu: po otwarciu aplikacji i po 5 minutach w tle trzeba odblokować
// telefonem (wzór / PIN / odcisk). Działa tylko, gdy szybkie logowanie jest włączone na tym telefonie i sesja
// jest ważna - bez tego aplikacja wygląda jak dotąd (logowanie hasłem na ekranie logowania).
import { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import quickLogin from '../services/quickLogin';
import tokenService from '../services/tokenService';
import { GlobalStateContext } from '../context/GlobalState';
import { tc, createThemedStyles, useAppTheme } from '../context/ThemeContext';
import { look } from './AdminLook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkAndApplyUpdate } from '../services/appUpdates'; // nowa wersja przed odblokowaniem (31.10.2026)

export const LOCK_AFTER_MS = 5 * 60 * 1000;

// Czy zablokować: szybkie logowanie włączone, odblokowanie dostępne, sesja ważna
export const shouldLock = async () => {
    // Konto, na które telefon jest teraz zalogowany (przy kilku zapamiętanych kontach - właśnie to)
    let currentUserId;
    try {
        const stored = JSON.parse((await AsyncStorage.getItem('user')) || 'null');
        currentUserId = stored?.userId || stored?._id;
    } catch (error) {
        currentUserId = undefined;
    }
    const saved = await quickLogin.getSaved(currentUserId);
    if (!saved) return null;
    if ((await quickLogin.availability()) !== 'ok') return null;
    const authenticated = await tokenService.isAuthenticated().catch(() => false);
    return authenticated ? saved : null;
};

const AppLock = () => {
    useAppTheme();
    const { logout } = useContext(GlobalStateContext) || {};
    const [locked, setLocked] = useState(null); // zapamiętane konto, gdy zablokowane
    const [busy, setBusy] = useState(false);
    const backgroundAt = useRef(null);
    const unlocking = useRef(false);

    const tryUnlock = async () => {
        if (unlocking.current) return;
        unlocking.current = true;
        setBusy(true);
        try {
            if (await quickLogin.unlock('Odblokuj aplikację Bukowski')) setLocked(null);
        } finally {
            unlocking.current = false;
            setBusy(false);
        }
    };

    const lockIfNeeded = async () => {
        const saved = await shouldLock();
        if (saved) setLocked(saved);
    };

    useEffect(() => {
        lockIfNeeded(); // otwarcie aplikacji
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'background') {
                if (!unlocking.current) backgroundAt.current = Date.now(); // okno PIN-u też chowa aplikację - nie liczymy
            } else if (state === 'active') {
                const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
                backgroundAt.current = null;
                if (away >= LOCK_AFTER_MS) lockIfNeeded();
            }
        });
        return () => subscription?.remove?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Po zablokowaniu: najpierw nowa wersja aplikacji (wgrywa się od razu - przed odblokowaniem nikt nie pracuje;
    // dawniej blokada nie sprawdzała aktualizacji i kto tylko odblokowywał aplikację, zostawał na starej wersji),
    // potem okno odblokowania
    useEffect(() => {
        if (!locked) return undefined;
        let active = true;
        checkAndApplyUpdate().then((result) => {
            if (active && result?.status !== 'reloading') tryUnlock();
        });
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locked?.userId]);

    if (!locked) return null;
    return (
        <Modal visible transparent={false} animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
            <View style={styles.screen} testID="app-lock">
                <View style={[look.modalHeaderIcon, styles.icon]}>
                    <Ionicons name="lock-closed" size={30} color="#0D6EFD" />
                </View>
                <Text style={styles.title}>Aplikacja zablokowana</Text>
                <Text style={styles.subtitle}>{[locked.symbol || locked.email, locked.role === 'admin' ? 'Administrator' : locked.sellingPoint].filter(Boolean).join(' · ')}</Text>
                <TouchableOpacity style={[look.primaryButton, styles.button, busy && look.disabled]} onPress={tryUnlock} disabled={busy} testID="app-lock-unlock">
                    <Ionicons name="finger-print" size={20} color="#fff" />
                    <Text style={look.buttonText}>{busy ? 'Odblokowywanie…' : 'Odblokuj'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.logout}
                    onPress={async () => { setLocked(null); if (logout) await logout(); }}
                    testID="app-lock-logout"
                >
                    <Text style={styles.logoutText}>Wyloguj</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

const styles = createThemedStyles(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: tc('bg', '#000'), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    icon: { backgroundColor: 'rgba(13, 110, 253, 0.15)', marginBottom: 16 },
    title: { color: tc('text', '#fff'), fontSize: 22, fontWeight: '700' },
    subtitle: { color: tc('muted', '#94A3B8'), fontSize: 15, marginTop: 6, textAlign: 'center' },
    button: { flex: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginTop: 28 },
    logout: { marginTop: 18, padding: 8 },
    logoutText: { color: tc('muted', '#94A3B8'), fontSize: 15, fontWeight: '600' },
}));

export default AppLock;

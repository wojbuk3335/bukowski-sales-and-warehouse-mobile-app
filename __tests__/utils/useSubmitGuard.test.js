// Blokada podwójnego kliknięcia: drugie wywołanie w trakcie zapisu jest ignorowane, po zapisie znów działa
import { act, renderHook } from '@testing-library/react-native';
import { useSubmitGuard } from '../../utils/useSubmitGuard';

describe('useSubmitGuard', () => {
  test('dwa szybkie kliknięcia = jeden zapis; po zakończeniu można zapisać ponownie', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    let finish;
    const save = jest.fn(() => new Promise((resolve) => { finish = resolve; }));

    let first;
    await act(async () => {
      first = result.current[1](save);
      result.current[1](save); // drugie kliknięcie w trakcie
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(true);

    await act(async () => { finish(); await first; });
    expect(result.current[0]).toBe(false);

    await act(async () => { const again = result.current[1](save); finish(); await again; });
    expect(save).toHaveBeenCalledTimes(2);
  });

  test('błąd zapisu zdejmuje blokadę', async () => {
    const { result } = renderHook(() => useSubmitGuard());
    await act(async () => {
      await expect(result.current[1](() => Promise.reject(new Error('sieć')))).rejects.toThrow('sieć');
    });
    expect(result.current[0]).toBe(false);
  });
});

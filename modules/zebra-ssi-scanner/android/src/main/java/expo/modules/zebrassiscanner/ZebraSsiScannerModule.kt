package expo.modules.zebrassiscanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.util.Base64
import android.view.View
import com.zebra.barcode.sdk.sms.ConfigurationUpdateEvent
import com.zebra.scannercontrol.DCSSDKDefs
import com.zebra.scannercontrol.DCSScannerInfo
import com.zebra.scannercontrol.FirmwareUpdateEvent
import com.zebra.scannercontrol.IDcsSdkApiDelegate
import com.zebra.scannercontrol.SDKHandler
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.nio.charset.Charset

/**
 * Czytnik Zebra (DS2278) przez Bluetooth w trybie SSI (12.11.2026).
 *
 * Dotąd czytnik był sparowany jako klawiatura Bluetooth (HID): „wpisywał” cyfry kodu do ukrytego pola, a aplikacja
 * zgadywała po czasie, kiedy kod się skończył - przy szybkim remanencie kody były cięte i sklejane, a telefon nie mógł
 * nic odesłać do czytnika. W SSI czytnik oddaje CAŁY kod jednym zdarzeniem (z typem kodu), a aplikacja steruje jego
 * sygnałem: kod policzony = zwykły pisk, kod odrzucony = inny sygnał błędu, słyszalny z czytnika, gdy telefon jest
 * w kieszeni.
 *
 * Biblioteka: Zebra Barcode Scanner SDK for Android 2.6.29 (plik .aar w libs, z publicznego repozytorium ZebraDevs, MIT).
 * Parowanie: kod Scan-To-Connect wyświetlany w aplikacji (dcssdkGetPairingBarcode) - czytnik go skanuje i sam łączy
 * się z telefonem. Nowe Androidy nie zdradzają aplikacji własnego adresu Bluetooth - wtedy użytkownik wpisuje go raz
 * (Ustawienia → Informacje o telefonie), aplikacja przekazuje go do SDK.
 *
 * Zdarzenia do JS: onBarcode { data, type, scannerId }, onScannerAppeared / onScannerDisappeared,
 * onSessionEstablished / onSessionTerminated. Czytnik, który się pojawi, jest łączony automatycznie.
 */
class ZebraSsiScannerModule : Module(), IDcsSdkApiDelegate {
  private var handler: SDKHandler? = null
  private var activeScannerId: Int = -1
  private var lastScannerName: String = ""

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ZebraSsiScanner")

    Events(
      "onBarcode",
      "onScannerAppeared",
      "onScannerDisappeared",
      "onSessionEstablished",
      "onSessionTerminated",
      "onLog"
    )

    // Moduł jest w tym buildzie (JS sprawdza to przed pokazaniem trybu „Czytnik Zebra (SSI)”)
    Function("isAvailable") { true }

    // Uruchomienie SDK: nasłuch czytników (Bluetooth Classic SSI + BLE), automatyczne łączenie z tym, który się pojawi
    // SDKHandler rejestruje obserwator cyklu życia (addObserver) - wolno to robić tylko z wątku głównego
    // (build 19: „Method addObserver must be called on the main thread”), stąd runOnQueue(Queues.MAIN)
    // protocol: "classic" = tylko Bluetooth Classic (SSI cradle host), "ble" = tylko Bluetooth LE, "both" = oba.
    // Build 20: oba tryby naraz + ponowne nawiązywanie sesji z już połączonym czytnikiem = połączenie zrywane zaraz
    // po nawiązaniu; teraz jeden tryb, zgodny z kodem parowania, i sesja tylko gdy czytnik nie jest aktywny.
    AsyncFunction("start") { protocol: String ->
      startSdk(protocol)
      status()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      stopSdk()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getStatus") { status() }

    // Kod parowania Scan-To-Connect jako PNG (base64). protocol: "classic" (SSI przez Bluetooth Classic, domyślnie dla
    // DS2278) albo "ble"; factoryDefaults: czytnik przy parowaniu wraca do ustawień fabrycznych + ten protokół;
    // btAddress: adres Bluetooth telefonu, gdy SDK sam go nie zna (Android 8+ nie zdradza go aplikacjom).
    AsyncFunction("getPairingBarcodePng") { protocol: String, factoryDefaults: Boolean, btAddress: String?, width: Int, height: Int ->
      pairingBarcodePng(protocol, factoryDefaults, btAddress, width, height)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("connect") { scannerId: Int ->
      val sdk = handler ?: return@AsyncFunction false
      if (activeScannerId == scannerId) {
        log("connect: czytnik $scannerId już ma sesję")
        return@AsyncFunction true
      }
      val result = sdk.dcssdkEstablishCommunicationSession(scannerId)
      log("connect($scannerId) -> ${result.name}")
      result == DCSSDKDefs.DCSSDK_RESULT.DCSSDK_RESULT_SUCCESS
    }

    AsyncFunction("disconnect") { scannerId: Int ->
      val sdk = handler ?: return@AsyncFunction false
      sdk.dcssdkTerminateCommunicationSession(scannerId) == DCSSDKDefs.DCSSDK_RESULT.DCSSDK_RESULT_SUCCESS
    }

    // Sygnał czytnika: wartości RMD_ATTR_VALUE_ACTION_* (0..24: krótkie/długie, wysokie/niskie piski, warble, high-low…)
    AsyncFunction("beep") { pattern: Int ->
      setAction(pattern)
    }

    // Włączenie / wyłączenie skanowania (np. gdy na ekranie jest pytanie): czytnik nie czyta, dopóki nie włączymy
    AsyncFunction("setScanEnabled") { enabled: Boolean ->
      val sdk = handler ?: return@AsyncFunction false
      val id = activeScannerId
      if (id < 0) return@AsyncFunction false
      val opcode = if (enabled) DCSSDKDefs.DCSSDK_COMMAND_OPCODE.DCSSDK_DEVICE_SCAN_ENABLE else DCSSDKDefs.DCSSDK_COMMAND_OPCODE.DCSSDK_DEVICE_SCAN_DISABLE
      val xml = "<inArgs><scannerID>$id</scannerID></inArgs>"
      sdk.dcssdkExecuteCommandOpCodeInXMLForScanner(opcode, xml, StringBuilder(), id) == DCSSDKDefs.DCSSDK_RESULT.DCSSDK_RESULT_SUCCESS
    }

    OnDestroy {
      stopSdk()
    }
  }

  // ---------- SDK ----------

  // Komunikaty z modułu na ekran (wyniki wywołań SDK) - bez logcata nie da się inaczej zobaczyć, co SDK odpowiada
  private fun log(message: String) {
    try { sendEvent("onLog", mapOf("message" to message)) } catch (error: Throwable) { /* brak JS */ }
  }

  private var currentProtocol: String = "classic"

  private fun startSdk(protocol: String) {
    if (handler != null) {
      if (protocol != currentProtocol) {
        // zmiana trybu (LE <-> Classic) = SDK od nowa
        stopSdk()
      } else {
        return
      }
    }
    currentProtocol = protocol
    val sdk = SDKHandler(appContext.currentActivity ?: context)
    sdk.dcssdkSetDelegate(this)
    if (protocol == "ble") {
      sdk.dcssdkSetOperationalMode(DCSSDKDefs.DCSSDK_MODE.DCSSDK_OPMODE_BT_LE)
      sdk.dcssdkSetCommunicationProtocol(DCSSDKDefs.DCSSDK_BT_PROTOCOL.SSI_BT_LE)
    } else if (protocol == "both") {
      sdk.dcssdkSetOperationalMode(DCSSDKDefs.DCSSDK_MODE.DCSSDK_OPMODE_BT_NORMAL)
      sdk.dcssdkSetOperationalMode(DCSSDKDefs.DCSSDK_MODE.DCSSDK_OPMODE_BT_LE)
    } else {
      sdk.dcssdkSetOperationalMode(DCSSDKDefs.DCSSDK_MODE.DCSSDK_OPMODE_BT_NORMAL)
      sdk.dcssdkSetCommunicationProtocol(DCSSDKDefs.DCSSDK_BT_PROTOCOL.SSI_BT_CRADLE_HOST)
    }
    val mask = DCSSDKDefs.DCSSDK_EVENT.DCSSDK_EVENT_SCANNER_APPEARANCE.value or
      DCSSDKDefs.DCSSDK_EVENT.DCSSDK_EVENT_SCANNER_DISAPPEARANCE.value or
      DCSSDKDefs.DCSSDK_EVENT.DCSSDK_EVENT_SESSION_ESTABLISHMENT.value or
      DCSSDKDefs.DCSSDK_EVENT.DCSSDK_EVENT_SESSION_TERMINATION.value or
      DCSSDKDefs.DCSSDK_EVENT.DCSSDK_EVENT_BARCODE.value
    sdk.dcssdkSubsribeForEvents(mask)
    sdk.dcssdkSetSTCEnabledState(true)
    // bez filtru SDK zgłasza WSZYSTKIE sparowane urządzenia Bluetooth (zegarek, czujnik tętna) i automat łączył się
    // z zegarkiem (build 21, 13.11.2026) - tylko urządzenia Zebry
    try { sdk.dcssdkEnableBluetoothClassicFiltration(true) } catch (error: Throwable) { log("filtr Zebry: ${error.message}") }
    val detection = sdk.dcssdkEnableAvailableScannersDetection(true)
    handler = sdk
    log("SDK ${sdk.dcssdkGetVersion()} start, tryb=$protocol, wykrywanie=${detection.name}")
    // czytnik sparowany wcześniej (już „widoczny” dla SDK) - łączymy, jeśli nie ma jeszcze sesji
    val known = ArrayList<DCSScannerInfo>()
    sdk.dcssdkGetAvailableScannersList(known)
    known.forEach { log("widoczny: id=${it.scannerID} ${it.scannerName} ${it.connectionType?.name} active=${it.isActive}") }
    known.firstOrNull { !it.isActive && isZebraScanner(it) }?.let { tryConnect(it.scannerID) }
  }

  // Czytnik Zebry po nazwie/modelu (DS2278, CS4070, RS5100…) - zegarki i czujniki nie są czytnikami
  private fun isZebraScanner(info: DCSScannerInfo?): Boolean {
    val text = "${info?.scannerName ?: ""} ${info?.scannerModel ?: ""}"
    return Regex("\\b(DS|CS|RS|LI|RFD)\\s?\\d{3,4}\\b|zebra", RegexOption.IGNORE_CASE).containsMatchIn(text)
  }

  private fun stopSdk() {
    val sdk = handler ?: return
    try {
      if (activeScannerId >= 0) sdk.dcssdkTerminateCommunicationSession(activeScannerId)
      sdk.dcssdkEnableAvailableScannersDetection(false)
      sdk.dcssdkClose()
    } catch (error: Throwable) {
      // zamknięcie SDK nie może wywrócić aplikacji
    }
    handler = null
    activeScannerId = -1
  }

  private fun tryConnect(scannerId: Int) {
    val sdk = handler ?: return
    if (activeScannerId == scannerId) return // sesja już jest - ponowne nawiązywanie ją zrywało (build 20)
    Thread {
      try {
        val result = sdk.dcssdkEstablishCommunicationSession(scannerId)
        log("auto-connect($scannerId) -> ${result.name}")
      } catch (error: Throwable) {
        log("auto-connect($scannerId) wyjątek: ${error.message}")
      }
    }.start()
  }

  private fun setAction(pattern: Int): Boolean {
    val sdk = handler ?: return false
    val id = activeScannerId
    if (id < 0) return false
    val xml = "<inArgs><scannerID>$id</scannerID><cmdArgs><arg-int>$pattern</arg-int></cmdArgs></inArgs>"
    return try {
      sdk.dcssdkExecuteCommandOpCodeInXMLForScanner(DCSSDKDefs.DCSSDK_COMMAND_OPCODE.DCSSDK_SET_ACTION, xml, StringBuilder(), id) ==
        DCSSDKDefs.DCSSDK_RESULT.DCSSDK_RESULT_SUCCESS
    } catch (error: Throwable) {
      false
    }
  }

  private fun scannerMap(info: DCSScannerInfo?): Map<String, Any?> = mapOf(
    "id" to (info?.scannerID ?: -1),
    "name" to (info?.scannerName ?: ""),
    "model" to (info?.scannerModel ?: ""),
    "serial" to (info?.scannerHWSerialNumber ?: ""),
    "active" to (info?.isActive ?: false),
    "connectionType" to (info?.connectionType?.name ?: "")
  )

  private fun status(): Map<String, Any?> {
    val sdk = handler
    val available = ArrayList<DCSScannerInfo>()
    val active = ArrayList<DCSScannerInfo>()
    if (sdk != null) {
      try { sdk.dcssdkGetAvailableScannersList(available) } catch (error: Throwable) { /* lista pusta */ }
      try { sdk.dcssdkGetActiveScannersList(active) } catch (error: Throwable) { /* lista pusta */ }
    }
    return mapOf(
      "started" to (sdk != null),
      "activeScannerId" to activeScannerId,
      "activeScannerName" to lastScannerName,
      "available" to available.map { scannerMap(it) },
      "active" to active.map { scannerMap(it) },
      "sdkVersion" to (sdk?.dcssdkGetVersion() ?: "")
    )
  }

  private fun pairingBarcodePng(protocol: String, factoryDefaults: Boolean, btAddress: String?, width: Int, height: Int): String? {
    val sdk = handler ?: return null
    val proto = if (protocol == "ble") DCSSDKDefs.DCSSDK_BT_PROTOCOL.SSI_BT_LE else DCSSDKDefs.DCSSDK_BT_PROTOCOL.SSI_BT_CRADLE_HOST
    val config = if (factoryDefaults) DCSSDKDefs.DCSSDK_BT_SCANNER_CONFIG.SET_FACTORY_DEFAULTS else DCSSDKDefs.DCSSDK_BT_SCANNER_CONFIG.KEEP_CURRENT
    sdk.dcssdkSetCommunicationProtocol(proto)
    var view = sdk.dcssdkGetPairingBarcode(proto, config)
    val address = btAddress?.trim().orEmpty()
    if (view == null && address.isNotEmpty()) {
      // SDK nie zna adresu Bluetooth telefonu (Android 8+) - użytkownik podał go ręcznie
      sdk.dcssdkSetBTAddress(address)
      view = sdk.dcssdkGetPairingBarcode(proto, config, address)
    }
    if (view == null) return null
    val w = if (width > 0) width else 1000
    val h = if (height > 0) height else 300
    view.setSize(w, h)
    view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
    view.layout(0, 0, w, h)
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.WHITE)
    view.draw(canvas)
    val output = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
    bitmap.recycle()
    return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
  }

  // ---------- IDcsSdkApiDelegate (wywołania z wątków SDK) ----------

  override fun dcssdkEventScannerAppeared(availableScanner: DCSScannerInfo?) {
    log("pojawił się: id=${availableScanner?.scannerID} ${availableScanner?.scannerName} ${availableScanner?.connectionType?.name} active=${availableScanner?.isActive}")
    sendEvent("onScannerAppeared", scannerMap(availableScanner))
    // czytnik już aktywny (sesja zestawiona przez SDK) - nie nawiązujemy drugiej; tylko czytniki Zebry
    availableScanner?.takeIf { !it.isActive && isZebraScanner(it) }?.let { tryConnect(it.scannerID) }
  }

  override fun dcssdkEventScannerDisappeared(scannerID: Int) {
    sendEvent("onScannerDisappeared", mapOf("id" to scannerID))
  }

  override fun dcssdkEventCommunicationSessionEstablished(activeScanner: DCSScannerInfo?) {
    activeScannerId = activeScanner?.scannerID ?: -1
    lastScannerName = activeScanner?.scannerName ?: ""
    log("sesja zestawiona: id=$activeScannerId $lastScannerName ${activeScanner?.connectionType?.name}")
    sendEvent("onSessionEstablished", scannerMap(activeScanner))
    // po przerwie (poza zasięgiem, uśpienie) SDK sam odnawia sesję - ustawiane poza wątkiem zdarzenia SDK
    val id = activeScannerId
    Thread {
      try {
        val result = handler?.dcssdkEnableAutomaticSessionReestablishment(true, id)
        log("auto-reconnect($id) -> ${result?.name}")
      } catch (error: Throwable) {
        log("auto-reconnect($id) wyjątek: ${error.message}")
      }
    }.start()
  }

  override fun dcssdkEventCommunicationSessionTerminated(scannerID: Int) {
    log("sesja zakończona: id=$scannerID")
    if (activeScannerId == scannerID) activeScannerId = -1
    sendEvent("onSessionTerminated", mapOf("id" to scannerID))
  }

  override fun dcssdkEventBarcode(barcodeData: ByteArray?, barcodeType: Int, fromScannerID: Int) {
    val data = barcodeData?.toString(Charset.forName("ISO-8859-1")) ?: ""
    sendEvent("onBarcode", mapOf("data" to data, "type" to barcodeType, "scannerId" to fromScannerID))
  }

  override fun dcssdkEventImage(imageData: ByteArray?, fromScannerID: Int) {}
  override fun dcssdkEventVideo(videoFrame: ByteArray?, fromScannerID: Int) {}
  override fun dcssdkEventBinaryData(binaryData: ByteArray?, fromScannerID: Int) {}
  override fun dcssdkEventFirmwareUpdate(firmwareUpdateEvent: FirmwareUpdateEvent?) {}
  override fun dcssdkEventAuxScannerAppeared(newTopology: DCSScannerInfo?, auxScanner: DCSScannerInfo?) {}
  override fun dcssdkEventConfigurationUpdate(configurationUpdateEvent: ConfigurationUpdateEvent?) {}
}

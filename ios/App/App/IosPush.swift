import Capacitor
import UIKit
import UserNotifications

private struct PushActivation: Codable, Equatable {
    let accountId: String
    let apiBaseUrl: String
    let activationId: String

    var scope: [String: Any] {
        [
            "accountId": accountId,
            "apiBaseUrl": apiBaseUrl,
            "activationId": activationId,
            "providerKey": "apns"
        ]
    }
}

final class IosPush: NSObject, UNUserNotificationCenterDelegate {
    static let shared = IosPush()
    private let storageKey = "de.eimir.app.push.activation"
    private let center = UNUserNotificationCenter.current()
    private var activation: PushActivation?
    private var registration = UUID()
    private var waitingForToken = false
    private var pendingOpen: (String, String)?
    private var lastOpen: String?
    weak var plugin: IosPushPlugin? {
        didSet { flushOpen() }
    }

    override private init() {
        if let stored = UserDefaults.standard.data(forKey: storageKey) {
            activation = try? JSONDecoder().decode(PushActivation.self, from: stored)
        }
        super.init()
    }

    static var environment: String? {
        Bundle.main.object(forInfoDictionaryKey: "EimirAPNsEnvironment") as? String
    }

    private func configured(_ call: CAPPluginCall) -> (String, String)? {
        guard call.getString("providerKey") == "apns",
              let bundleID = Bundle.main.bundleIdentifier,
              call.getString("bundleId") == bundleID,
              let environment = Self.environment,
              ["development", "production"].contains(environment),
              call.getString("environment") == environment,
              let account = call.getString("accountId"),
              UUID(uuidString: account)?.uuidString.lowercased() == account,
              let api = call.getString("apiBaseUrl"), api.count <= 2048,
              let url = URLComponents(string: api),
              url.scheme == "https", url.host != nil, url.user == nil,
              url.password == nil, url.query == nil, url.fragment == nil
        else { return nil }
        return (account, api)
    }

    func status(_ call: CAPPluginCall) {
        center.getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                guard let self else { call.reject("PUSH_DEVICE_STATUS_UNAVAILABLE"); return }
                let allowed = settings.authorizationStatus == .authorized
                let scope = self.activation?.scope ?? [
                    "accountId": NSNull(), "apiBaseUrl": NSNull(),
                    "activationId": NSNull(), "providerKey": NSNull()
                ]
                call.resolve(scope.merging([
                    "enabled": self.activation != nil && allowed,
                    "permissionGranted": allowed,
                    "fcmAvailable": false,
                    "firebaseProjectId": NSNull(),
                    "androidPackage": "",
                    "iosBundleId": Bundle.main.bundleIdentifier ?? "",
                    "apnsEnvironment": Self.environment ?? ""
                ]) { _, updated in updated })
            }
        }
    }

    func enable(_ call: CAPPluginCall) {
        guard let (account, api) = configured(call) else {
            call.reject("INVALID_PUSH_CONFIGURATION")
            return
        }
        if activation?.accountId != account || activation?.apiBaseUrl != api { disable() }
        let request = UUID()
        registration = request
        center.requestAuthorization(options: [.alert, .sound]) { [weak self] allowed, error in
            DispatchQueue.main.async {
                guard let self, self.registration == request else {
                    call.reject("PUSH_REQUEST_CANCELLED")
                    return
                }
                guard allowed && error == nil else {
                    call.reject("NOTIFICATION_PERMISSION_DENIED")
                    return
                }
                let selected = self.activation ?? PushActivation(
                    accountId: account, apiBaseUrl: api,
                    activationId: UUID().uuidString.lowercased()
                )
                do {
                    let data = try JSONEncoder().encode(selected)
                    UserDefaults.standard.set(data, forKey: self.storageKey)
                    self.activation = selected
                } catch {
                    call.reject("PUSH_DEVICE_STORAGE_UNAVAILABLE")
                    return
                }
                self.requestToken()
                call.resolve()
            }
        }
    }

    func refresh(_ call: CAPPluginCall) {
        guard let (account, api) = configured(call),
              activation?.accountId == account, activation?.apiBaseUrl == api
        else { call.resolve(["enabled": false]); return }
        requestToken()
        call.resolve(["enabled": true])
    }

    private func requestToken() {
        let request = UUID()
        registration = request
        waitingForToken = true
        UIApplication.shared.registerForRemoteNotifications()
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self, self.registration == request, self.waitingForToken else { return }
            self.registrationFailed()
        }
    }

    func registered(token: Data) {
        guard let activation else { return }
        waitingForToken = false
        let hex = token.map { String(format: "%02x", $0) }.joined()
        let endpoint = ["token": hex, "activationId": activation.activationId]
        guard let data = try? JSONEncoder().encode(endpoint),
              let value = String(data: data, encoding: .utf8)
        else { registrationFailed(); return }
        plugin?.emit("endpoint", activation.scope.merging(["endpointValue": value]) { _, new in new })
    }

    func registrationFailed() {
        waitingForToken = false
        guard let activation else { return }
        plugin?.emit("unavailable", activation.scope.merging([
            "reason": "PUSH_DEVICE_REGISTRATION_FAILED"
        ]) { _, new in new })
    }

    func disable() {
        registration = UUID()
        waitingForToken = false
        pendingOpen = nil
        lastOpen = nil
        activation = nil
        UserDefaults.standard.removeObject(forKey: storageKey)
        UIApplication.shared.unregisterForRemoteNotifications()
        center.removeAllDeliveredNotifications()
    }

    private func reference(_ notification: UNNotification) -> (String, String)? {
        let info = notification.request.content.userInfo
        guard let id = info["notificationId"] as? String,
              UUID(uuidString: id)?.uuidString.lowercased() == id,
              let activationId = info["activationId"] as? String,
              activation?.activationId == activationId
        else { return nil }
        return (activationId, id)
    }

    func open(_ response: UNNotificationResponse) {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let (activationId, id) = reference(response.notification), lastOpen != id
        else { return }
        lastOpen = id
        pendingOpen = (activationId, id)
        flushOpen()
    }

    private func flushOpen() {
        guard let plugin, let activation, let (activationId, id) = pendingOpen,
              activation.activationId == activationId
        else { return }
        pendingOpen = nil
        plugin.emit("notificationOpen", activation.scope.merging([
            "notificationId": id
        ]) { _, new in new }, retain: true)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        DispatchQueue.main.async { [weak self] in
            if let self, self.reference(notification) != nil, let activation = self.activation {
                self.plugin?.emit("wake", activation.scope)
            }
            completionHandler([])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        DispatchQueue.main.async { [weak self] in
            self?.open(response)
            completionHandler()
        }
    }
}

@objc(EimirPush)
final class IosPushPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "EimirPush"
    let jsName = "EimirPush"
    let pluginMethods = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise)
    ]

    override func load() {
        DispatchQueue.main.async { IosPush.shared.plugin = self }
    }

    func emit(_ event: String, _ fields: [String: Any], retain: Bool = false) {
        notifyListeners(event, data: fields, retainUntilConsumed: retain)
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { IosPush.shared.status(call) }
    }

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { IosPush.shared.enable(call) }
    }

    @objc func refresh(_ call: CAPPluginCall) {
        DispatchQueue.main.async { IosPush.shared.refresh(call) }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            IosPush.shared.disable()
            call.resolve()
        }
    }

    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }
}

final class EimirBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(IosPushPlugin())
        bridge?.registerPluginInstance(IosSessionStorage())
    }
}

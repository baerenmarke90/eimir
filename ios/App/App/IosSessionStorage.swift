import Capacitor
import Foundation
import Security

@objc(NativeSessionStorage)
final class IosSessionStorage: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativeSessionStorage"
    let jsName = "NativeSessionStorage"
    let pluginMethods = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]
    private let io = DispatchQueue(label: "de.eimir.app.session-keychain")
    private let maxSize = 128 * 1024
    private static let service = "de.eimir.app.native-session"

    static func clearPriorInstallation() -> Bool {
        // The Keychain may survive uninstall while UserDefaults does not.
        let query = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ] as [String: Any]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    private func slot(_ call: CAPPluginCall) -> [String: Any]? {
        guard UserDefaults.standard.bool(forKey: "de.eimir.app.installation-initialized"),
              let instance = call.getString("instance"), instance.count <= 2048,
              let url = URLComponents(string: instance),
              url.scheme == "https", url.host != nil, url.user == nil,
              url.password == nil, url.query == nil, url.fragment == nil
        else { return nil }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: instance
        ]
    }

    private func unavailable(_ call: CAPPluginCall) {
        call.reject("Secure session storage unavailable", "NATIVE_SESSION_STORAGE_UNAVAILABLE")
    }

    @objc func read(_ call: CAPPluginCall) {
        io.async {
            guard var query = self.slot(call) else { self.unavailable(call); return }
            query[kSecReturnData as String] = true
            query[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            if status == errSecItemNotFound { call.resolve(); return }
            guard status == errSecSuccess, let data = result as? Data,
                  data.count <= self.maxSize, let value = String(data: data, encoding: .utf8)
            else { self.unavailable(call); return }
            call.resolve(["value": value])
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        io.async {
            guard let query = self.slot(call), let value = call.getString("value"),
                  let data = value.data(using: .utf8), data.count <= self.maxSize
            else { self.unavailable(call); return }
            let update = [kSecValueData as String: data]
            var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
            if status == errSecItemNotFound {
                var attributes = query
                attributes[kSecValueData as String] = data
                attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                status = SecItemAdd(attributes as CFDictionary, nil)
            }
            if status == errSecSuccess { call.resolve() }
            else { self.unavailable(call) }
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        io.async {
            guard let query = self.slot(call) else { self.unavailable(call); return }
            let status = SecItemDelete(query as CFDictionary)
            if status == errSecSuccess || status == errSecItemNotFound { call.resolve() }
            else { self.unavailable(call) }
        }
    }
}

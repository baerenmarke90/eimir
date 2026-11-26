import Capacitor
import UIKit

/** A content-free, memory-only handoff until the authorized Web shell is ready. */
final class IosAppShortcuts {
    static let shared = IosAppShortcuts()
    weak var plugin: IosAppShortcutsPlugin?
    private var pending: [String: String]?

    func open(_ item: UIApplicationShortcutItem) -> Bool {
        let actions = [
            "de.eimir.app.shortcut.moment": "moment",
            "de.eimir.app.shortcut.wish": "wish",
            "de.eimir.app.shortcut.plan": "plan"
        ]
        guard let action = actions[item.type] else { return false }
        pending = ["id": UUID().uuidString.lowercased(), "action": action]
        plugin?.notifyListeners("shortcutOpen", data: [:])
        return true
    }

    func peek() -> [String: Any] {
        guard let pending else { return [:] }
        return ["request": pending]
    }

    func acknowledge(_ id: String?) {
        if let id, pending?["id"] == id { pending = nil }
    }
}

@objc(AppShortcuts)
final class IosAppShortcutsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AppShortcuts"
    let jsName = "AppShortcuts"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "peek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise)
    ]

    override func load() {
        DispatchQueue.main.async { IosAppShortcuts.shared.plugin = self }
    }

    @objc func peek(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(IosAppShortcuts.shared.peek()) }
    }

    @objc func acknowledge(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            IosAppShortcuts.shared.acknowledge(call.getString("id"))
            call.resolve()
        }
    }
}


# ServerAdminMonitoring


## Properties

Name | Type
------------ | -------------
`alertsEnabled` | boolean
`points` | [Array&lt;ServerAdminMonitoringPoint&gt;](ServerAdminMonitoringPoint.md)
`pushEnabled` | boolean
`range` | string
`services` | [Array&lt;ServerAdminServiceState&gt;](ServerAdminServiceState.md)
`storage` | [ServerAdminMonitoringStorage](ServerAdminMonitoringStorage.md)

## Example

```typescript
import type { ServerAdminMonitoring } from ''

// TODO: Update the object below with actual values
const example = {
  "alertsEnabled": null,
  "points": null,
  "pushEnabled": null,
  "range": null,
  "services": null,
  "storage": null,
} satisfies ServerAdminMonitoring

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminMonitoring
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



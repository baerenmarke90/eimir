
# ServerAdminSettings


## Properties

Name | Type
------------ | -------------
`effectiveRegistrationEnabled` | boolean
`maintenanceMode` | boolean
`registrationEnabled` | boolean
`version` | number

## Example

```typescript
import type { ServerAdminSettings } from ''

// TODO: Update the object below with actual values
const example = {
  "effectiveRegistrationEnabled": null,
  "maintenanceMode": null,
  "registrationEnabled": null,
  "version": null,
} satisfies ServerAdminSettings

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminSettings
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



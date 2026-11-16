
# PartnerLocationSettingsView

The caller\'s own sharing state; never the partner\'s.

## Properties

Name | Type
------------ | -------------
`available` | boolean
`expiresAt` | Date
`generation` | number
`indefinite` | boolean
`lastPublishedAt` | Date
`level` | [SharingLevel](SharingLevel.md)
`state` | [SharingState](SharingState.md)

## Example

```typescript
import type { PartnerLocationSettingsView } from ''

// TODO: Update the object below with actual values
const example = {
  "available": null,
  "expiresAt": null,
  "generation": null,
  "indefinite": null,
  "lastPublishedAt": null,
  "level": null,
  "state": null,
} satisfies PartnerLocationSettingsView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PartnerLocationSettingsView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



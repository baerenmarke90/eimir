
# ServerAdminEntitlementGrantView

One historical grant row. Never exposes provider secrets/tokens.

## Properties

Name | Type
------------ | -------------
`capabilities` | Array&lt;string&gt;
`createdAt` | Date
`effectiveFrom` | Date
`effectiveUntil` | Date
`externalReference` | string
`id` | string
`sourceType` | [EntitlementSourceType](EntitlementSourceType.md)
`status` | [EntitlementStatus](EntitlementStatus.md)
`tier` | [EntitlementTier](EntitlementTier.md)

## Example

```typescript
import type { ServerAdminEntitlementGrantView } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "createdAt": null,
  "effectiveFrom": null,
  "effectiveUntil": null,
  "externalReference": null,
  "id": null,
  "sourceType": null,
  "status": null,
  "tier": null,
} satisfies ServerAdminEntitlementGrantView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminEntitlementGrantView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)




# ServerAdminEntitlementGrantRequest


## Properties

Name | Type
------------ | -------------
`capabilities` | Array&lt;string&gt;
`effectiveUntil` | Date
`reason` | string
`tier` | [EntitlementTier](EntitlementTier.md)

## Example

```typescript
import type { ServerAdminEntitlementGrantRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "effectiveUntil": null,
  "reason": null,
  "tier": null,
} satisfies ServerAdminEntitlementGrantRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminEntitlementGrantRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



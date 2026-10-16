
# ServerAdminSpaceEntitlementView


## Properties

Name | Type
------------ | -------------
`capabilities` | Array&lt;string&gt;
`effectiveUntil` | Date
`grants` | [Array&lt;ServerAdminEntitlementGrantView&gt;](ServerAdminEntitlementGrantView.md)
`isInGracePeriod` | boolean
`spaceId` | string
`status` | [EntitlementStatus](EntitlementStatus.md)
`tier` | [EntitlementTier](EntitlementTier.md)

## Example

```typescript
import type { ServerAdminSpaceEntitlementView } from ''

// TODO: Update the object below with actual values
const example = {
  "capabilities": null,
  "effectiveUntil": null,
  "grants": null,
  "isInGracePeriod": null,
  "spaceId": null,
  "status": null,
  "tier": null,
} satisfies ServerAdminSpaceEntitlementView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminSpaceEntitlementView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



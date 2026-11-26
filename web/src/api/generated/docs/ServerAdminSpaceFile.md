
# ServerAdminSpaceFile


## Properties

Name | Type
------------ | -------------
`entitlement` | [ServerAdminSpaceEntitlementView](ServerAdminSpaceEntitlementView.md)
`members` | [Array&lt;ServerAdminSpaceMember&gt;](ServerAdminSpaceMember.md)
`space` | [ServerAdminSpaceDetail](ServerAdminSpaceDetail.md)
`storage` | [ServerAdminSpaceStorage](ServerAdminSpaceStorage.md)
`timeline` | [Array&lt;ServerAdminSpaceTimelineEntry&gt;](ServerAdminSpaceTimelineEntry.md)

## Example

```typescript
import type { ServerAdminSpaceFile } from ''

// TODO: Update the object below with actual values
const example = {
  "entitlement": null,
  "members": null,
  "space": null,
  "storage": null,
  "timeline": null,
} satisfies ServerAdminSpaceFile

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminSpaceFile
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



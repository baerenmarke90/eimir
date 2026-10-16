
# ServerAdminStorageOverview

Aggregate-only storage projection with no content/ownership metadata.

## Properties

Name | Type
------------ | -------------
`deleteFailedCount` | number
`deletingCount` | number
`failedCount` | number
`growth` | [Array&lt;ServerAdminStorageGrowth&gt;](ServerAdminStorageGrowth.md)
`mediaTypeCounts` | [Array&lt;ServerAdminStorageMediaCount&gt;](ServerAdminStorageMediaCount.md)
`readyBytes` | number
`readyCount` | number
`readySizeUnknownCount` | number
`statusCounts` | [Array&lt;ServerAdminStorageStatusCount&gt;](ServerAdminStorageStatusCount.md)
`thumbnailReadyCount` | number
`uploadingCount` | number
`validatingCount` | number

## Example

```typescript
import type { ServerAdminStorageOverview } from ''

// TODO: Update the object below with actual values
const example = {
  "deleteFailedCount": null,
  "deletingCount": null,
  "failedCount": null,
  "growth": null,
  "mediaTypeCounts": null,
  "readyBytes": null,
  "readyCount": null,
  "readySizeUnknownCount": null,
  "statusCounts": null,
  "thumbnailReadyCount": null,
  "uploadingCount": null,
  "validatingCount": null,
} satisfies ServerAdminStorageOverview

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminStorageOverview
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



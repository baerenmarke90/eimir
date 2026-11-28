
# ServerAdminSpaceStorage


## Properties

Name | Type
------------ | -------------
`byMediaType` | [Array&lt;ServerAdminMediaTypeUsage&gt;](ServerAdminMediaTypeUsage.md)
`override` | [ServerAdminStorageQuotaOverride](ServerAdminStorageQuotaOverride.md)
`quotaBytes` | number
`tierQuotaBytes` | number
`usedBytes` | number

## Example

```typescript
import type { ServerAdminSpaceStorage } from ''

// TODO: Update the object below with actual values
const example = {
  "byMediaType": null,
  "override": null,
  "quotaBytes": null,
  "tierQuotaBytes": null,
  "usedBytes": null,
} satisfies ServerAdminSpaceStorage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminSpaceStorage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



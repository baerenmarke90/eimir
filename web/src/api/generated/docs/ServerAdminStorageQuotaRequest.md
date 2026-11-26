
# ServerAdminStorageQuotaRequest


## Properties

Name | Type
------------ | -------------
`effectiveUntil` | Date
`quotaGb` | number

## Example

```typescript
import type { ServerAdminStorageQuotaRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "effectiveUntil": null,
  "quotaGb": null,
} satisfies ServerAdminStorageQuotaRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminStorageQuotaRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



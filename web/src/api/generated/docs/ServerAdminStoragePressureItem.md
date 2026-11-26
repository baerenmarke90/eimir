
# ServerAdminStoragePressureItem

A Space at or above 85 % of its Cloud quota: id and bytes only.

## Properties

Name | Type
------------ | -------------
`quotaBytes` | number
`spaceId` | string
`usedBytes` | number

## Example

```typescript
import type { ServerAdminStoragePressureItem } from ''

// TODO: Update the object below with actual values
const example = {
  "quotaBytes": null,
  "spaceId": null,
  "usedBytes": null,
} satisfies ServerAdminStoragePressureItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminStoragePressureItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



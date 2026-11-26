
# ServerAdminExpiringGrantItem

An operator grant that ends within seven days: ids and end only.

## Properties

Name | Type
------------ | -------------
`effectiveUntil` | Date
`grantId` | string
`spaceId` | string

## Example

```typescript
import type { ServerAdminExpiringGrantItem } from ''

// TODO: Update the object below with actual values
const example = {
  "effectiveUntil": null,
  "grantId": null,
  "spaceId": null,
} satisfies ServerAdminExpiringGrantItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminExpiringGrantItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



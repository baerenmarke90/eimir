
# ServerAdminJobList


## Properties

Name | Type
------------ | -------------
`items` | [Array&lt;ServerAdminJobItem&gt;](ServerAdminJobItem.md)
`limit` | number
`offset` | number
`total` | number

## Example

```typescript
import type { ServerAdminJobList } from ''

// TODO: Update the object below with actual values
const example = {
  "items": null,
  "limit": null,
  "offset": null,
  "total": null,
} satisfies ServerAdminJobList

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminJobList
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



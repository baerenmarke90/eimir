
# SpaceStorageUsage

How much of the Cloud storage quota of the Space is used (#2141).

## Properties

Name | Type
------------ | -------------
`available` | number
`quota` | number
`used` | number

## Example

```typescript
import type { SpaceStorageUsage } from ''

// TODO: Update the object below with actual values
const example = {
  "available": null,
  "quota": null,
  "used": null,
} satisfies SpaceStorageUsage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpaceStorageUsage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



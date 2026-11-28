
# ServerAdminAccountSpace

One Space the Account belongs or belonged to; ids and status only.

## Properties

Name | Type
------------ | -------------
`membershipStatus` | string
`since` | Date
`spaceId` | string

## Example

```typescript
import type { ServerAdminAccountSpace } from ''

// TODO: Update the object below with actual values
const example = {
  "membershipStatus": null,
  "since": null,
  "spaceId": null,
} satisfies ServerAdminAccountSpace

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminAccountSpace
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



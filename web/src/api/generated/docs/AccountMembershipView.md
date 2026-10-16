
# AccountMembershipView

Active Space membership belonging to the authenticated account.

## Properties

Name | Type
------------ | -------------
`role` | string
`spaceId` | string
`status` | string

## Example

```typescript
import type { AccountMembershipView } from ''

// TODO: Update the object below with actual values
const example = {
  "role": null,
  "spaceId": null,
  "status": null,
} satisfies AccountMembershipView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AccountMembershipView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



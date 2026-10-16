
# SpaceMembershipExitView

Safe lifecycle state after self-exit from one Space.

## Properties

Name | Type
------------ | -------------
`endedAt` | Date
`spaceId` | string
`status` | [MembershipStatus](MembershipStatus.md)

## Example

```typescript
import type { SpaceMembershipExitView } from ''

// TODO: Update the object below with actual values
const example = {
  "endedAt": null,
  "spaceId": null,
  "status": null,
} satisfies SpaceMembershipExitView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpaceMembershipExitView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



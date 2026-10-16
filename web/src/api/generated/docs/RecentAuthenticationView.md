
# RecentAuthenticationView


## Properties

Name | Type
------------ | -------------
`achievedAt` | Date
`expiresAt` | Date
`method` | string
`purpose` | string

## Example

```typescript
import type { RecentAuthenticationView } from ''

// TODO: Update the object below with actual values
const example = {
  "achievedAt": null,
  "expiresAt": null,
  "method": null,
  "purpose": null,
} satisfies RecentAuthenticationView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RecentAuthenticationView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



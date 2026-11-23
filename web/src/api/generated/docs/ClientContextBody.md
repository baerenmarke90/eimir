
# ClientContextBody

App and device context on the wire (camelCase).

## Properties

Name | Type
------------ | -------------
`appVersion` | string
`build` | string
`engine` | string
`localTime` | string
`locale` | string
`online` | boolean
`os` | string
`platform` | string
`theme` | string
`timeZone` | string

## Example

```typescript
import type { ClientContextBody } from ''

// TODO: Update the object below with actual values
const example = {
  "appVersion": null,
  "build": null,
  "engine": null,
  "localTime": null,
  "locale": null,
  "online": null,
  "os": null,
  "platform": null,
  "theme": null,
  "timeZone": null,
} satisfies ClientContextBody

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ClientContextBody
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



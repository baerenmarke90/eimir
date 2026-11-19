
# ReminderWishOrigin

The Wish a Plan reminder\'s Plan grew out of (#1816).  Resolved at read time through ``Plan.sourceWishId``; nothing is stored on the Reminder, so it cannot drift from the Wish/Plan lifecycle. It carries no authored text: the client reads the Wish through its own API, which applies the Wish\'s own access rules.

## Properties

Name | Type
------------ | -------------
`seriesPosition` | number
`wishId` | string

## Example

```typescript
import type { ReminderWishOrigin } from ''

// TODO: Update the object below with actual values
const example = {
  "seriesPosition": null,
  "wishId": null,
} satisfies ReminderWishOrigin

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ReminderWishOrigin
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



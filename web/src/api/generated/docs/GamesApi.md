# GamesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createHeartHuntRound**](GamesApi.md#createhearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds | Create Round |
| [**finishPicturePingPong**](GamesApi.md#finishpicturepingpong) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong/finish | Finish Picture Ping Pong |
| [**getCoupleExperienceQuestions**](GamesApi.md#getcoupleexperiencequestions) | **GET** /api/v1/spaces/{spaceId}/experiences/{kind}/questions | Get Couple Experience Questions |
| [**getGameMomentCandidates**](GamesApi.md#getgamemomentcandidates) | **GET** /api/v1/spaces/{spaceId}/games/moments/candidates | Get Game Moment Candidates |
| [**getGameWishCandidates**](GamesApi.md#getgamewishcandidates) | **GET** /api/v1/spaces/{spaceId}/games/wishes/candidates | Get Game Wish Candidates |
| [**getHeartHunt**](GamesApi.md#gethearthunt) | **GET** /api/v1/spaces/{spaceId}/games/heart-hunt | Get Heart Hunt |
| [**getPicturePingPong**](GamesApi.md#getpicturepingpong) | **GET** /api/v1/spaces/{spaceId}/games/picture-ping-pong | Get Picture Ping Pong |
| [**handOverPicturePingPongTurn**](GamesApi.md#handoverpicturepingpongturn) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong/turns | Hand Over Picture Ping Pong Turn |
| [**keepHeartHuntRound**](GamesApi.md#keephearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/kept | Keep Round |
| [**markPicturePingPongSaved**](GamesApi.md#markpicturepingpongsaved) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong/saved | Mark Picture Ping Pong Saved |
| [**startPicturePingPong**](GamesApi.md#startpicturepingpong) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong | Start Picture Ping Pong |
| [**tapHeartHuntRound**](GamesApi.md#taphearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/taps | Tap Round |



## createHeartHuntRound

> HeartHuntRoundView createHeartHuntRound(spaceId, heartHuntRoundCreate)

Create Round

Hide a heart in an uploaded photo and send it to the partner.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { CreateHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // HeartHuntRoundCreate
    heartHuntRoundCreate: ...,
  } satisfies CreateHeartHuntRoundRequest;

  try {
    const data = await api.createHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntRoundCreate** | [HeartHuntRoundCreate](HeartHuntRoundCreate.md) |  | |

### Return type

[**HeartHuntRoundView**](HeartHuntRoundView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## finishPicturePingPong

> PicturePingPongState finishPicturePingPong(spaceId, pictureFinishInput)

Finish Picture Ping Pong

Either partner may call the picture finished early.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { FinishPicturePingPongRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PictureFinishInput
    pictureFinishInput: ...,
  } satisfies FinishPicturePingPongRequest;

  try {
    const data = await api.finishPicturePingPong(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **pictureFinishInput** | [PictureFinishInput](PictureFinishInput.md) |  | |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getCoupleExperienceQuestions

> CoupleExperienceQuestions getCoupleExperienceQuestions(kind, spaceId)

Get Couple Experience Questions

Three stable inspirations per shared calendar day, without an answer limit.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetCoupleExperienceQuestionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // ExperienceKind
    kind: ...,
    // string
    spaceId: spaceId_example,
  } satisfies GetCoupleExperienceQuestionsRequest;

  try {
    const data = await api.getCoupleExperienceQuestions(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **kind** | `ExperienceKind` |  | [Defaults to `undefined`] [Enum: HAPPINESS, TIME_TRAVEL] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CoupleExperienceQuestions**](CoupleExperienceQuestions.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGameMomentCandidates

> GameMemoryCandidateSet getGameMomentCandidates(spaceId)

Get Game Moment Candidates

Return Premium-authorized shared photo Memories for the first #863 grammar.  Normal authentication and Space membership are resolved before this route receives &#x60;authorization&#x60;. Commercial entitlement is then enforced on the server. The actual content query remains constrained by the existing &#x60;readable()&#x60; authorization predicate and existing attachment bindings.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameMomentCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameMomentCandidatesRequest;

  try {
    const data = await api.getGameMomentCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameMemoryCandidateSet**](GameMemoryCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGameWishCandidates

> GameWishCandidateSet getGameWishCandidates(spaceId)

Get Game Wish Candidates

Return Premium-authorized OPEN shared Wishes for #864.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameWishCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameWishCandidatesRequest;

  try {
    const data = await api.getGameWishCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameWishCandidateSet**](GameWishCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getHeartHunt

> HeartHuntState getHeartHunt(spaceId)

Get Heart Hunt

Open rounds of the two partners; the seeker never receives the heart early.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetHeartHuntRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetHeartHuntRequest;

  try {
    const data = await api.getHeartHunt(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**HeartHuntState**](HeartHuntState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPicturePingPong

> PicturePingPongState getPicturePingPong(spaceId)

Get Picture Ping Pong

The current shared picture, or &#x60;null&#x60; when none was started.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetPicturePingPongRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetPicturePingPongRequest;

  try {
    const data = await api.getPicturePingPong(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## handOverPicturePingPongTurn

> PicturePingPongState handOverPicturePingPongTurn(spaceId, pictureTurnInput)

Hand Over Picture Ping Pong Turn

Add up to three strokes for the current turn and pass the picture on.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { HandOverPicturePingPongTurnRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PictureTurnInput
    pictureTurnInput: ...,
  } satisfies HandOverPicturePingPongTurnRequest;

  try {
    const data = await api.handOverPicturePingPongTurn(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **pictureTurnInput** | [PictureTurnInput](PictureTurnInput.md) |  | |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## keepHeartHuntRound

> HeartHuntRoundView keepHeartHuntRound(roundId, spaceId, heartHuntKept)

Keep Round

Record that the found photo was saved as a shared Moment by explicit tap.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { KeepHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    roundId: roundId_example,
    // string
    spaceId: spaceId_example,
    // HeartHuntKept
    heartHuntKept: ...,
  } satisfies KeepHeartHuntRoundRequest;

  try {
    const data = await api.keepHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roundId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntKept** | [HeartHuntKept](HeartHuntKept.md) |  | |

### Return type

[**HeartHuntRoundView**](HeartHuntRoundView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## markPicturePingPongSaved

> PicturePingPongState markPicturePingPongSaved(spaceId, pictureSavedInput)

Mark Picture Ping Pong Saved

Record the Memory the finished picture was saved to (explicit tap only).

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { MarkPicturePingPongSavedRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PictureSavedInput
    pictureSavedInput: ...,
  } satisfies MarkPicturePingPongSavedRequest;

  try {
    const data = await api.markPicturePingPongSaved(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **pictureSavedInput** | [PictureSavedInput](PictureSavedInput.md) |  | |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startPicturePingPong

> PicturePingPongState startPicturePingPong(spaceId)

Start Picture Ping Pong

Open a new picture; the partner who opens it draws first.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { StartPicturePingPongRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies StartPicturePingPongRequest;

  try {
    const data = await api.startPicturePingPong(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## tapHeartHuntRound

> HeartHuntTapResult tapHeartHuntRound(roundId, spaceId, heartHuntTap)

Tap Round

Clear fog at a tap; the answer is a coarse warmth and whether the heart was found.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { TapHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    roundId: roundId_example,
    // string
    spaceId: spaceId_example,
    // HeartHuntTap
    heartHuntTap: ...,
  } satisfies TapHeartHuntRoundRequest;

  try {
    const data = await api.tapHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roundId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntTap** | [HeartHuntTap](HeartHuntTap.md) |  | |

### Return type

[**HeartHuntTapResult**](HeartHuntTapResult.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


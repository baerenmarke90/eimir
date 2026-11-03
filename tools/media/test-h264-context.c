/* Exercise the codec-mismatch boundary without trusting an input-file suffix. */
#include <stdint.h>
#include "libavcodec/avcodec.h"

int avpriv_h264_has_num_reorder_frames(AVCodecContext *avctx);

int main(void)
{
    AVCodecContext mismatch = {0};
    mismatch.codec = avcodec_find_decoder(AV_CODEC_ID_AAC);
    mismatch.codec_id = AV_CODEC_ID_H264;
    mismatch.priv_data = (void *)(uintptr_t)1;
    if (!mismatch.codec || avpriv_h264_has_num_reorder_frames(&mismatch) != 0)
        return 1;
    if (avpriv_h264_has_num_reorder_frames(NULL) != 0)
        return 2;
    AVCodecContext *h264 = avcodec_alloc_context3(avcodec_find_decoder(AV_CODEC_ID_H264));
    if (!h264 || avpriv_h264_has_num_reorder_frames(h264) != 0)
        return 3;
    avcodec_free_context(&h264);
    return 0;
}

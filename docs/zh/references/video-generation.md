# 视频生成接入说明

Pen-Time 的视频生成页面使用当前模型服务中已启用、已配置 API Key 的 New API 兼容服务商，不再内置默认视频模型。用户需要先在「模型服务」中添加视频模型，并将模型端点类型设置为 `video-generation`。

## 接口

- 创建任务：`POST /v1/videos`
- 查询状态：`GET /v1/video/generations/{task_id}`

请求体只发送当前接口需要的核心字段：

```json
{
  "model": "gemini-veo-3.1-generate-preview-8s",
  "prompt": "...",
  "size": "1280x720"
}
```

如果用户上传首帧或尾帧，会额外发送 `image`、`first_frame_image`、`last_frame_image`。

## 尺寸选项

视频页面默认配置中的尺寸选项固定为：

- `1280x720`
- `720x1280`
- `1920x1080`
- `1080x1920`

页面不再展示 `720p`、`1080p`、`16:9`、`9:16` 等独立标志。比例由尺寸本身表达，例如 `1280x720` 表示横版 16:9，`720x1280` 表示竖版 9:16。

## 状态展示

服务端返回的任务状态在界面上统一显示为中文：

- `NOT_START`：未开始
- `SUBMITTED`：已提交
- `QUEUED`：排队中
- `IN_PROGRESS`：处理中
- `SUCCESS`：成功
- `FAILURE`：失败
- `UNKNOWN`：未知

// translate-inject.js — DOM-based locale overlay for the upstream editor
// Uses MutationObserver to translate text as it appears in the DOM when zh-CN is active
// This script is injected into the webview alongside the editor build

;(function () {
  'use strict'

  function getEditorLanguage() {
    const params = new URLSearchParams(window.location.search)
    const requested = params.get('lang') || 'zh-CN'
    return requested.toLowerCase().startsWith('en') ? 'en' : 'zh-CN'
  }

  function applyDocumentLanguage(language) {
    document.documentElement.lang = language
  }

  // ── Translation map (inlined for performance) ──
  const T = {
    'Scene': '场景', 'Property Line': '地块边界', 'Area': '面积', 'Perimeter': '周长',
    'Add point': '添加点', 'Upload scan/floorplan': '上传扫描图/平面图',
    'Building': '建筑', 'Level': '楼层', 'No levels yet': '暂无楼层',
    'Add level': '添加楼层', 'No buildings yet': '暂无建筑',
    'Camera snapshot': '相机快照', 'View snapshot': '查看快照',
    'Take snapshot': '拍摄快照', 'Update snapshot': '更新快照',
    'Clear snapshot': '清除快照', 'Delete': '删除',
    'The ground level cannot be deleted': '地面层不能删除',
    'No zones on this level': '此楼层无区域', 'Add one': '添加一个',
    'No elements on this level': '此楼层无元素',
    'Select a level to view content': '选择楼层查看内容',
    'Delete level': '删除楼层', 'Structure': '结构', 'Furnish': '装饰',
    'Zones': '区域', 'Cutaway': '剖切', 'Up': '向上', 'Down': '向下',
    'Manual': '手动', 'Stack': '堆叠', 'Stacked': '堆叠', 'Exploded': '爆炸视图', 'Solo': '单独',
    'Type a new name…': '输入新名称…', 'Type a new name above…': '在上面输入新名称…',
    'Camera Snapshot — Select Scope': '相机快照 — 选择范围',
    'Site': '场地', 'Selection': '选择', 'Properties': '属性', 'No selection': '未选择对象',
    'Pin inspector': '固定属性面板', 'Unpin inspector': '取消固定属性面板',
    'Wall Mode': '墙体模式',
    'Level Mode': '楼层模式', 'Rename Level': '重命名楼层', 'Go to Level': '转到楼层',
    'Wall': '墙体', '2D Sketch': '2D 草图', 'Slab': '楼板', 'Ceiling': '天花板',
    'Gable Roof': '山墙屋顶', 'Stairs': '楼梯', 'Door': '门', 'Window': '窗户',
    'Fence': '围栏', 'Zone': '区域', 'Furniture': '家具', 'Lighting': '灯光', 'Appliance': '电器',
    'Kitchen': '厨房', 'Bathroom': '浴室', 'Outdoor': '户外',
    'navigate': '导航', 'select': '选择', 'back': '返回', 'close': '关闭',
    'Send Feedback': '发送反馈',
    'We\'d love to hear your thoughts': '我们很乐意听取您的想法',
    'Thanks for your feedback!': '感谢您的反馈！',
    'Your feedback': '您的反馈',
    'Share your thoughts, suggestions, feature requests, or report issues...': '分享您的想法、建议、功能请求或报告问题...',
    'Drop images here': '拖放图片到这里', 'Cancel': '取消', 'Sending...': '发送中...',
    'Attach': '添加附件', 'Length': '长度', 'Height': '高度', 'Width': '宽度',
    'Thickness': '厚度', 'Depth': '深度', 'Rotation': '旋转', 'Position': '位置',
    'Dimensions': '尺寸', 'Material': '材质', 'White': '白色', 'Brick': '砖块',
    'Concrete': '混凝土', 'Wood': '木材', 'Glass': '玻璃', 'Metal': '金属',
    'Plaster': '石膏', 'Tile': '瓷砖', 'Marble': '大理石', 'Custom': '自定义',
    'Color': '颜色', 'Roughness': '粗糙度', 'Metalness': '金属度',
    'Opacity': '不透明度', 'Side': '面', 'Front': '正面', 'Back': '背面',
    'Double': '双面', 'Feedback': '反馈', 'Move': '移动', 'Hide': '隐藏',
    'Show all': '全部显示', 'Show all hidden nodes': '显示全部隐藏对象',
    'Nothing hidden': '没有隐藏内容', 'Nothing to undo': '没有可撤销操作',
    'Nothing to redo': '没有可重做操作', 'Hide level': '隐藏楼层',
    'Show level': '显示楼层', 'Hide other levels': '隐藏其它楼层',
    'Show all levels': '显示全部楼层', 'Level actions': '楼层操作',
    'Transparent': '透明', 'Opaque': '恢复不透明', 'Duplicate': '复制',
    'Cut Out': '切割', 'Add': '添加', 'Remove': '移除', 'Done': '完成',
    'Curve': '弯曲', 'Trim / Extend': '修剪/延伸',
    'Orbit Left': '向左旋转', 'Orbit Right': '向右旋转', 'Top View': '俯视图',
    'Clear selection': '清除选择', 'Add level above': '在上方添加楼层',
    'Add level below': '在下方添加楼层', 'Insert level here': '在此处插入楼层',
    'Are you sure you want to delete': '确定要删除',
    'All walls, floors, and objects on this level will be permanently removed': '此楼层上的所有墙体、地板和物体将被永久删除',
    'Info': '信息', 'Holes': '孔洞', 'Style': '样式', 'Footprint': '轮廓',
    'Heights': '高度', 'Roof Type': '屋顶类型', 'Segments': '分段',
    'Actions': '操作', 'Grid': '网格', 'Frame': '框架', 'Sill': '窗台',
    'Hardware': '五金', 'Swing': '开启方向', 'Content Padding': '内容内边距',
    'Threshold': '门槛', 'Handle': '把手', 'Bar': '栏杆',
    'Enable Threshold': '启用门槛', 'Enable Handle': '启用把手',
    'Enable Sill': '启用窗台', 'Door Closer': '门闭器', 'Panic Bar': '恐慌杆',
    'Flip Side': '翻转侧边', 'Horizontal': '水平', 'Vertical': '垂直',
    'Add flight': '添加梯段', 'Add landing': '添加平台', 'Rise': '踏步高',
    'Steps': '踏步数', 'Fit To Floor': '适配地板', 'Inner Radius': '内半径',
    'Sweep': '扫描角度', 'Top Landing': '顶部平台', 'Center Column': '中心柱',
    'Step Supports': '踏步支撑', 'Columns': '列数', 'Post Spacing': '立柱间距',
    'Post Size': '立柱尺寸', 'Ground Clear': '离地间隙', 'Edge Inset': '边缘内缩',
    'Base Height': '基座高度', 'Top Rail': '顶部栏杆', 'Scale': '缩放',
    'Elevation': '标高', 'Collections': '集合', 'Manage collections…': '管理集合…',
    'New': '新建', 'Manage collections': '管理集合', 'Rename': '重命名',
    'No collections yet. Create one to group items together.': '暂无集合。创建一个来分组项目。',
    'Wall Tool': '墙体工具', 'Sketch Line Tool': '草图线工具',
    'Construction Line Tool': '参考线工具', 'Reference Line Tool': '参考线工具',
    'Sketch Rectangle Tool': '草图矩形工具',
    'Slab Tool': '楼板工具', 'Ceiling Tool': '天花板工具',
    'Door Tool': '门工具', 'Window Tool': '窗工具', 'Item Tool': '物品工具',
    'Stair Tool': '楼梯工具', 'Zone Tool': '区域工具', 'Delete Selection': '删除选中',
    'Add Level': '添加楼层',
    'Camera: Switch to Orthographic': '相机：切换到正交视图',
    'Camera: Switch to Perspective': '相机：切换到透视图',
    'Switch to Light Theme': '切换到浅色主题', 'Switch to Dark Theme': '切换到深色主题',
    'Preview': '预览',
    'Exit Preview': '退出预览', 'Enter Preview': '进入预览',
    'Toggle Fullscreen': '切换全屏', 'Undo': '撤销', 'Redo': '重做',
    'No commands found.': '未找到命令。', 'Search actions...': '搜索操作...',
    'Filter options...': '筛选选项...',
    'Something went wrong': '出错了', 'Try again': '重试',
    'Export Scene (JSON)': '导出场景 (JSON)', 'Export 3D Model (GLB)': '导出 3D 模型 (GLB)',
    'Copy Share Link': '复制分享链接', 'Take Screenshot': '截图',
    // Catalog items
    'Pillar': '柱子', 'High Fence': '高栅栏', 'Medium Fence': '中栅栏',
    'Low Fence': '低栅栏', 'Bush': '灌木', 'Fir': '冷杉', 'Tree': '树',
    'Palm': '棕榈树', 'Patio Umbrella': '露台伞', 'Sunbed': '日光浴床',
    'Double Window': '双窗', 'Simple Window': '简单窗', 'Rectangle Window': '矩形窗',
    'Door with bar': '带杆门', 'Glass Door': '玻璃门', 'Parking Spot': '停车位',
    'Wine Bottle': '酒瓶',
    'Toilet Paper': '卫生纸', 'Shower Rug': '淋浴垫', 'Laundry Bag': '洗衣袋',
    'Drying Rack': '晾衣架', 'Washing Machine': '洗衣机', 'Toilet': '马桶',
    'Squared Shower': '方形淋浴', 'Angle Shower': '角形淋浴', 'Bathtub': '浴缸',
    'Bathroom Sink': '洗手盆', 'Ceiling fan': '吊扇', 'Electric Panel': '电箱',
    'Sprinkler': '喷头', 'Smoke Detector': '烟雾探测器', 'Fire Detector': '火灾探测器',
    'Exit Sign': '出口标志', 'Hydrant': '消防栓', 'Thermostat': '恒温器',
    'Air Conditioning': '空调', 'Toaster': '烤面包机', 'Kettle': '水壶',
    'Coffee Machine': '咖啡机', 'Television': '电视', 'Computer': '电脑',
    'Stereo Speaker': '音响', 'Toy': '玩具', 'Guitar': '吉他', 'Piano': '钢琴',
    'Round Carpet': '圆形地毯', 'Rectangular Carpet': '矩形地毯', 'Cactus': '仙人掌',
    'Small Plant': '小盆栽', 'Indoor Plant': '室内植物',
    'Ironing Board': '烫衣板', 'Coat Rack': '衣架', 'Trash Bin': '垃圾桶',
    'Rounded Mirror': '圆形镜子', 'Picture': '画', 'Books': '书', 'Column': '柱子',
    'TV Stand': '电视柜', 'Shelf': '架子', 'Bookshelf': '书架',
    'Ceiling Lamp': '吊灯', 'Recessed Light': '筒灯', 'Floor Lamp': '落地灯',
    'Table Lamp': '台灯', 'Closet': '衣柜', 'Dresser': '梳妆台',
    'Bunkbed': '双层床', 'Double Bed': '双人床', 'Single Bed': '单人床',
    'Sofa': '沙发', 'Lounge Chair': '躺椅', 'Stool': '凳子',
    'Threadmill': '跑步机', 'Treadmill': '跑步机',
    'Dining Chair': '餐椅', 'Office Chair': '办公椅', 'Livingroom Chair': '客厅椅',
    'Bedside Table': '床头柜', 'Coffee Table': '咖啡桌',
    'Office Table': '办公桌', 'Dining Table': '餐桌',
    'Microwave': '微波炉', 'Stove': '炉灶', 'Fridge': '冰箱',
    'Hood': '抽油烟机', 'Kitchen Shelf': '厨房架',
    'Kitchen Counter': '厨房台面', 'Kitchen Cabinet': '厨房柜',

    // ── Toolbar & view modes ──
    'Split': '分屏', 'Walkthrough': '漫游', 'Preview mode': '预览模式',
    'Light': '灯光', 'Power': '电源', 'Intensity': '亮度', 'Color Temp': '色温',
    'Perspective': '透视', 'Orthographic': '正交', 'Metric (m)': '公制 (m)',
    'Imperial (ft)': '英制 (ft)', 'Dark': '深色', 'Light': '浅色',
    'Orientation and sun': '方位与日照',
    'Compass markers': '方位标识', 'Sun shadows': '日照阴影',
    'Sun position': '太阳位置', 'Morning': '上午', 'Noon': '正午',
    'Afternoon': '下午', 'Evening': '傍晚',
    'Collapse sidebar': '收起侧边栏', 'Expand sidebar': '展开侧边栏',
    'Toggle Sidebar': '切换侧边栏',
    'Levels: Manual': '楼层：手动', 'Levels: Stack': '楼层：堆叠',
    'Levels: Exploded': '楼层：爆炸视图', 'Levels: Solo': '楼层：单独',
    'Walls: Full height': '墙体：全高', 'Walls: Cutaway': '墙体：剖切',
    'Walls: Low': '墙体：低',

    // ── Cutaway modes ──
    'Full height': '全高', 'Full Height': '全高', 'Low': '低',

    // ── Editor overlay labels ──
    'The editor scene failed to render': '编辑器场景渲染失败',
    'You can retry the scene or return home without reloading the whole app shell.': '您可以重试场景或返回主页，无需重新加载整个应用。',
    'Reload editor': '重新加载编辑器', 'Back to home': '返回主页',
    'Pan': '平移', 'Rotate': '旋转', 'Zoom': '缩放',
    'Scroll wheel': '滚轮', 'Dismiss': '关闭',

    // ── Control modes ──
    'Select': '选择', 'Box select': '框选', 'Edit site': '编辑场地', 'Build': '结构',

    // ── First person ──
    'Exit Street View': '退出漫游', 'Exit Walkthrough': '退出漫游', 'Sprint': '冲刺',
    'Click to look around': '点击环顾四周',
    'Street View': '漫游', 'Walk mode': '行走模式', 'Fly mode': '飞行模式',
    'Click canvas to enter walkthrough': '点击画面进入漫游',
    'Drag canvas to look around': '拖动画面环顾四周',
    'Double-click floor to move there': '双击地面前往此处',
    'Add route point': '添加路线点',
    'Double-click floor to add point': '双击地面添加点',
    'Double-click scene to add flight point': '双击场景添加飞行航点',
    'Look': '环顾', 'Mouse': '鼠标', 'Height': '高度',
    'Drag': '拖动',
    'Faster': '加速', 'Slower': '减速', 'Speed': '速度', 'Wheel': '滚轮',
    'Walk': '行走', 'Fly': '飞行', 'Adult': '成人', 'Child': '儿童',
    'Inspect': '检视', 'Quick': '快速',
    'Press M to switch walk/fly': '按 M 切换行走/飞行',
    'Map': '小地图', 'Floor plan': '平面图', 'All levels': '全部楼层',
    'Collision on': '碰撞开启', 'Floor follow on': '地面跟随开启', 'Fly height free': '飞行高度自由',
    'Aerial': '高空', 'Route': '路线', 'Plan': '规划', 'Run': '运行', 'Clear': '清空',
    'Rooms': '房间',
    'Current view': '当前位置', 'No rooms': '暂无房间',
    'Save view': '收藏视角', 'Saved views': '视角收藏',
    'No saved views': '暂无收藏视角', 'No map data': '暂无地图数据',
    'Start tour': '开始导览', 'Stop tour': '停止导览',
    'Present': '演示', 'Exit presentation': '退出演示',
    'Gamepad': '手柄', 'Touch move': '触控移动', 'View': '视角',

    // ── View toggles ──
    'Guide images': '引导图', 'No guide images on this level yet.': '此楼层暂无引导图。',
    'No scans on this level yet.': '此楼层暂无扫描。',
    'Visible': '显示', 'Hidden': '隐藏',
    'Guides: Visible': '引导图：显示', 'Guides: Hidden': '引导图：隐藏',
    'Scans: Visible': '扫描：显示', 'Scans: Hidden': '扫描：隐藏',

    // ── Settings panel ──
    'Settings': '设置', 'Visibility': '可见性', 'Public': '公开',
    'Only you': '仅自己', 'can view': '可以查看',
    'Show 3D Scans': '显示 3D 扫描', 'Visible to public viewers': '对公开查看者可见',
    'Show Floorplans': '显示平面图', 'Show Grid': '显示网格',
    'Visible only in the editor': '仅在编辑器中可见',
    'Export': '导出', 'Export GLB': '导出 GLB', 'Export STL': '导出 STL', 'Export OBJ': '导出 OBJ',
    'Thumbnail': '缩略图', 'Generating...': '生成中...', 'Generate Thumbnail': '生成缩略图',
    'Save & Load': '保存与加载', 'Save Build': '保存建筑', 'Load Build': '加载建筑',
    'Audio': '音频', 'Keyboard': '键盘',
    'Scene Graph': '场景图', 'Explore scene graph': '浏览场景图',
    'Danger Zone': '危险区域', 'Clear & Start New': '清除并新建',

    // ── Audio settings ──
    'Audio Settings': '音频设置', 'Adjust volume levels and mute settings': '调整音量和静音设置',
    'Master Volume': '主音量', 'Radio Volume': '电台音量', 'Sound Effects': '音效',
    'Mute All Sounds': '全部静音', 'Unmute All Sounds': '取消全部静音',

    // ── Keyboard shortcuts dialog ──
    'Keyboard Shortcuts': '键盘快捷键',
    'Shortcuts are context-aware and depend on the current phase or tool.': '快捷键根据当前阶段或工具自动切换。',
    'Editor Navigation': '编辑器导航', 'Switch to Site phase': '切换到场地阶段',
    'Switch to Structure phase': '切换到结构阶段', 'Switch to Furnish phase': '切换到装饰阶段',
    'Switch to Structure layer': '切换到结构层', 'Switch to Furnish layer': '切换到装饰层',
    'Switch to Zones layer': '切换到区域层',
    'Select next level in the active building': '选择当前建筑的下一个楼层',
    'Select previous level in the active building': '选择当前建筑的上一个楼层',
    'toggle sidebar': '切换侧边栏',
    'Modes & History': '模式与历史', 'Switch to Select mode': '切换到选择模式',
    'Switch to Build mode': '切换到结构模式',
    'Cancel the active tool and return to Select mode': '取消当前工具并返回选择模式',
    'Delete selected objects': '删除所选对象',
    'Add or remove an object from multi-selection': '从多选中添加或移除对象',
    'Drawing Tools': '绘图工具',
    'Temporarily disable angle snapping while drawing walls, slabs, and ceilings': '绘制墙体、楼板和天花板时临时禁用角度吸附',
    'Item Placement': '物品放置',
    'Rotate item clockwise by 90 degrees': '顺时针旋转物品 90 度',
    'Rotate item counter-clockwise by 90 degrees': '逆时针旋转物品 90 度',
    'Temporarily bypass placement validation constraints': '临时绕过放置验证约束',
    'Pan camera': '平移相机', 'Orbit camera': '旋转相机',

    // ── Door panel ──
    'Hinges Side': '铰链侧', 'Direction': '方向',
    'Inward': '向内', 'Outward': '向外',
    'Handle Side': '把手侧', 'Bar Height': '横杆高度',
    'Panel': '面板', 'Empty': '空心',
    'Presets': '预设', '+ Add Segment': '+ 添加段', '- Remove': '- 移除', 'Inset': '内缩',

    // ── Fence panel ──
    'Slat': '板条', 'Rail': '横栏', 'Privacy': '隐私',
    'Grounded': '落地', 'Floating': '悬浮',

    // ── Stair panel ──
    'Staircase': '楼梯', 'Straight': '直梯', 'Curved': '弧形梯', 'Spiral': '螺旋梯',
    'Geometry': '几何', 'Fill to floor': '填充到地板', 'Uniform Scale': '等比缩放',
    'Stair Segment': '楼梯段', 'Flight': '梯段', 'Landing': '平台',
    'Attachment': '连接侧', 'Add Segment': '添加段',

    // ── Roof types ──
    'Hip': '四坡', 'Gable': '山墙', 'Shed': '单坡', 'Flat': '平顶',
    'Gambrel': '折线', 'Dutch': '荷兰式', 'Mansard': '折坡',
    'Roof Segment': '屋顶段',

    // ── Slab panel ──
    'Sunken (-15cm)': '下沉 (-15cm)', 'Ground (0m)': '地面 (0m)',
    'Raised (+5cm)': '抬高 (+5cm)', 'Step (+15cm)': '台阶 (+15cm)',
    'No holes': '无孔洞', 'Add Hole': '添加孔洞',
    '(Editing)': '(编辑中)', 'Hole ': '孔洞 ', ' pts': ' 点',

    // ── Window panel ──
    'Columns': '列数', 'Rows': '行数', 'Col Widths': '列宽',
    'Row Heights': '行高', 'Divider': '分隔条',

    // ── Zone panel ──
    'Select a level to view and create zones': '选择楼层以查看和创建区域',

    // ── Reference panel ──
    '3D Scan': '3D 扫描', 'Guide Image': '引导图',
    'Scale & Opacity': '缩放与不透明度',

    // ── Presets popover ──
    'Save new': '新建保存', 'Community': '社区', 'My presets': '我的预设',
    'No community presets yet.': '暂无社区预设。',
    'No presets saved yet. Use "Save new" to save the current configuration.': '暂无保存的预设。使用"新建保存"保存当前配置。',
    'Sign in to save and view your presets.': '登录以保存和查看您的预设。',
    'Update with current': '用当前配置更新', 'Remove from community': '从社区移除',
    'Share with community': '分享到社区', 'Preset name…': '预设名称…',

    // ── Collections popover ──
    'Collection name…': '集合名称…',

    // ── Command palette categories ──
    'Viewer Controls': '查看器控制', 'View': '视图', 'History': '历史',
    'Snapshot': '快照',

    // ── Helper tooltips ──
    'Set wall start / end': '设置墙体起点/终点',
    'Allow non-45° angles': '允许非 45° 角度',
    'Set corner': '设置角点', 'Place item': '放置物品',
    'Rotate counterclockwise': '逆时针旋转', 'Rotate clockwise': '顺时针旋转',
    'Free place': '自由放置', 'Place building': '放置建筑',

    // ── Scene / loading labels ──
    'Item': '物品', 'Roof Segment': '屋顶段',
    'Levels': '楼层', 'Untitled': '未命名',

    // ── Wall panel ──
    'Library': '材质库',
    'Click the wall face you want to edit. Materials now apply to one side at a time.': '请点击要编辑的墙面；材质一次只应用到一侧。',
    'Trim / Extend Walls': '修剪/延伸墙体',

    // ── Wall edit tools ──
    'Chamfer': '倒角', 'Fillet': '圆角', 'Offset': '偏移',
    'Merge': '合并', 'Mirror': '镜像', 'Linear Pattern': '线性阵列',
    'Sketch Line': '草图线', 'Sketch Rectangle': '草图矩形',
    'Construction Line': '参考线', 'Reference Line': '参考线',
    'Smart Dimension': '智能尺寸', 'Fixed': '固定',
    'Construction': '参考线', 'Reference': '参考线',
    'Set Length': '设定长度', 'Equal Length': '等长',
    'Pattern': '阵列', 'Radius': '半径', 'Length': '长度',
    'Horizontal': '水平', 'Vertical': '垂直',
    'Split Wall': '分割墙体', 'Offset Wall': '偏移墙体', 'Set Wall Length': '设定墙体长度',
    'Fillet Walls': '圆角墙体', 'Chamfer Walls': '倒角墙体',
    'Linear Pattern Walls': '线性阵列墙体',
    'Create Zone': '创建区域', 'Create Slab': '创建楼板',
    'Create Wall': '创建墙体', 'Create Walls': '创建墙体',
    'Offset wall': '偏移墙体', 'Fillet wall': '圆角墙体', 'Chamfer wall': '倒角墙体',
    'Enter a chamfer distance, or press Enter for the default.': '输入倒角距离，或按回车键使用默认值。',
    'Enter a chamfer distance, or press Enter for default.': '输入倒角距离，或按回车键使用默认值。',
    'Enter a fillet radius, or press Enter for the default.': '输入圆角半径，或按回车键使用默认值。',
    'Enter distance from wall start, or click the wall to split.': '输入距墙体起点的距离，或点击墙体进行分割。',
    'Click a wall segment to trim, or an endpoint to extend.': '点击墙段进行修剪，或点击端点进行延伸。',
    'Click a wall where it should break.': '点击墙体需要分割的位置。',
    'Click a collinear wall that shares this endpoint.': '点击共用该端点的共线墙体。',
    'Move the pointer to choose side and distance, then click.': '移动指针选择方向和距离，然后点击。',
    'Click another wall that shares this corner.': '点击共用这个转角的另一面墙。',
    'Click another wall that shares this corner, then enter a chamfer distance.': '点击共用这个转角的另一面墙，然后输入倒角距离。',
    'Select walls, then click another wall to use as the mirror axis.': '先选择墙体，再点击另一面墙作为镜像轴。',
    'Enter spacing and count, or click a wall to use its direction.': '输入间距和数量，或点击一面墙作为方向。',
    'Only straight walls can be offset.': '只能偏移直墙。',
    'Select the wall to mirror, then click a different wall as the axis.': '选择要镜像的墙体，然后点击另一面墙作为轴线。',
    'Click a different wall to use as the mirror axis.': '点击另一面墙作为镜像轴。',
    'Select walls to pattern, then enter spacing and count.': '选择要阵列的墙体，然后输入间距和数量。',
    'Enter spacing and count, for example 1,3.': '输入间距和数量，例如 1,3。',
    'Enter the wall length to drive this segment.': '输入墙体长度以驱动该墙段。',
    'Enter the wall length.': '输入墙体长度。',
    'Enter the sketch line length.': '输入草图线长度。',
    'Enter a valid sketch length.': '请输入有效的草图长度。',
    'Closed sketch profile created. Select an edge to convert it to walls, slab, or zone.': '已创建闭合草图轮廓。请选择一条边以转换为墙体、楼板或区域。',
    'Select a sketch edge that belongs to a closed profile.': '请选择属于闭合轮廓的草图边。',
    'No walls were created from this sketch profile.': '未能从此草图轮廓创建墙体。',
    'Select one sketch line to dimension.': '请选择一条草图线进行标注。',
    'Select one sketch line to make horizontal.': '请选择一条草图线设为水平。',
    'Select one sketch line to make vertical.': '请选择一条草图线设为垂直。',
    'Select one sketch line to fix.': '请选择一条草图线进行固定。',
    'Select one sketch line to toggle construction.': '请选择一条草图线切换参考线属性。',
    'Select one sketch line to toggle reference mode.': '请选择一条草图线切换参考线属性。',
    'Select one sketch line to create a wall.': '请选择一条草图线创建墙体。',
    'No wall was created from this sketch line.': '未能从此草图线创建墙体。',
    'Fixed sketch geometry cannot be resized.': '固定的草图几何不能调整长度。',
    'Fixed sketch geometry cannot be reoriented.': '固定的草图几何不能重新定向。',
    'The selected sketch line is too short to resize.': '所选草图线太短，无法调整长度。',
    'The selected sketch line is too short to orient.': '所选草图线太短，无法定向。',
    'Select the first wall, then click the wall to merge.': '先选择第一面墙，再点击要合并的墙。',
    'Select the first wall, then click the wall to chamfer.': '先选择第一面墙，再点击要倒角的墙。',
    'Select the first wall, then click the wall to fillet.': '先选择第一面墙，再点击要圆角的墙。',
    'Click a second wall for this edit.': '点击第二面墙完成此编辑。',
    'Enter a valid split distance.': '请输入有效的分割距离。',
    'Split distance must be inside the wall length.': '分割距离必须在墙体长度范围内。',
    'Enter a valid offset distance.': '请输入有效的偏移距离。',
    'Enter a valid wall length.': '请输入有效的墙体长度。',
    'Enter a valid chamfer distance.': '请输入有效的倒角距离。',
    'Select two walls to chamfer.': '请选择两面墙进行倒角。',
    'Enter a valid fillet radius.': '请输入有效的圆角半径。',
    'Select two walls to fillet.': '请选择两面墙进行圆角。',
    'Select one wall to offset.': '请选择一面墙进行偏移。',
    'Select one wall to make horizontal.': '请选择一面墙设为水平。',
    'Select one wall to make vertical.': '请选择一面墙设为垂直。',
    'Select at least one wall to mirror.': '请至少选择一面墙进行镜像。',
    'Select at least one wall to pattern.': '请至少选择一面墙进行阵列。',
    'Select at least two walls to equalize length.': '请选择至少两面墙进行等长。',
    'Select a wall that belongs to a closed loop.': '请选择属于闭合轮廓的墙体。',
    'Closed loop detected. Select a wall in it to create a zone or slab.': '已检测到闭合轮廓。请选择其中一面墙来创建区域或楼板。',
    'Wall openings or attached items block this edit.': '墙体洞口或附着物阻止了此编辑。',
    'Curved walls cannot be split in this tool.': '此工具不能分割弧形墙。',
    'Pick a point inside the wall segment.': '请选择墙段内部的点。',
    'The split would create a wall segment that is too short.': '分割后会产生过短的墙段。',
    'A door, window, or wall item crosses the split point.': '门、窗或墙面物品跨过了分割点。',
    'No wall boundary crosses this wall.': '没有墙体边界与此墙相交。',
    'No trimmable wall segment was found.': '未找到可修剪的墙段。',
    'No nearby crossing wall can extend this endpoint.': '附近没有可用于延伸此端点的相交墙体。',
    'Curved walls cannot be trimmed or extended in this tool.': '此工具不能修剪或延伸弧形墙。',
    'Only straight walls can be merged.': '只能合并直墙。',
    'Walls must share an endpoint before they can merge.': '墙体必须共用一个端点才能合并。',
    'Walls must share thickness, height, material, and level.': '墙体的厚度、高度、材质和楼层必须一致。',
    'Walls must be collinear to merge.': '墙体必须共线才能合并。',
    'Only straight walls can receive a driving length.': '只有直墙可以设定驱动长度。',
    'The selected wall is too short to resize.': '所选墙体太短，无法调整长度。',
    'Only straight walls can receive horizontal or vertical relations.': '只有直墙可以设定水平或垂直关系。',
    'The selected wall is too short to orient.': '所选墙体太短，无法定向。',
    'Only straight walls can drive equal length.': '只有直墙可以作为等长参考。',
    'Select a second wall to equalize length.': '请选择第二面墙进行等长。',
    'Curved walls cannot be offset in this tool.': '此工具不能偏移弧形墙。',
    'The offset wall would be too short.': '偏移后的墙体会过短。',
    'Walls must share an endpoint for fillet v1.': '墙体必须共用一个端点才能做圆角。',
    'Only straight walls can be filleted in this tool.': '此工具只能对直墙做圆角。',
    'One of the wall legs is too short for a fillet.': '其中一段墙太短，无法做圆角。',
    'Walls need a clear corner angle for a fillet.': '墙体需要明确的转角角度才能做圆角。',
    'The fillet radius is too large for these walls.': '圆角半径对这些墙体来说过大。',
    'The fillet could not be built.': '无法生成圆角。',
    'A door, window, or wall item lies inside the fillet corner.': '门、窗或墙面物品位于圆角转角内。',
    'Pick a valid mirror axis.': '请选择有效的镜像轴。',
    'A mirrored wall would be too short.': '镜像后的墙体会过短。',
    'Pick a valid pattern direction.': '请选择有效的阵列方向。',
    'Enter a valid spacing and instance count.': '请输入有效的间距和实例数量。',
    'A patterned wall would be too short.': '阵列后的墙体会过短。',
    'Walls must share an endpoint for chamfer.': '墙体必须共用一个端点才能倒角。',
    'Only straight walls can be chamfered in this tool.': '此工具只能对直墙做倒角。',
    'The chamfer distance is too large for these walls.': '倒角距离对这些墙体来说过大。',
    'Walls need a clear corner angle for a chamfer.': '墙体需要明确的转角角度才能倒角。',
    'The chamfer wall would be too short.': '倒角墙体会过短。',
    'A door, window, or wall item lies inside the chamfer corner.': '门、窗或墙面物品位于倒角转角内。',

    // ── Wall numbering (regex-based) ──
    // These are handled by the translateText function
  }

  // ── Attributes to translate ──
  const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label']

  // ── Skip translating these elements ──
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'CANVAS'])

  // ── Skip SVG namespace entirely — the 2D floorplan is all SVG ──
  // SVG text labels (measurements, wall lengths, zone names) must NOT be modified
  const SVG_TAGS = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'line', 'polygon', 'polyline',
    'text', 'tspan', 'image', 'defs', 'clippath', 'use', 'foreignobject',
    'lineargradient', 'radialgradient', 'stop', 'pattern', 'mask', 'symbol',
    'marker', 'desc', 'title', 'ellipse',
  ])

  // ── Cache: track already-translated nodes to avoid re-processing ──
  const translatedNodes = new WeakSet()

  // ── Translate a text string ──
  function translateText(text) {
    if (!text) return text
    const trimmed = text.trim()
    if (!trimmed) return text

    // Direct match
    if (T[trimmed]) {
      return text.replace(trimmed, T[trimmed])
    }

    // Pattern: trailing half of the split "delete level" dialog copy.
    // React renders the level name in a <strong>, so the sentence spans text nodes.
    const deleteLevelTailMatch = trimmed.match(/^\?\s*All\s+walls,\s+floors,\s+and\s+objects\s+on\s+this\s+level\s+will\s+be\s+permanently\s+removed\.?$/)
    if (deleteLevelTailMatch) {
      return text.replace(trimmed, ' 吗？此楼层上的所有墙体、地板和物体将被永久删除。')
    }

    // Pattern: "Level 1", "Level -2" → "层 1", "层 -2"
    const levelMatch = trimmed.match(/^Level\s+(-?\d+)$/)
    if (levelMatch) {
      return text.replace(trimmed, `层 ${levelMatch[1]}`)
    }

    // Pattern: "Wall 1", "Wall 12" → "墙体 1", "墙体 12"
    const wallMatch = trimmed.match(/^Wall\s+(\d+(-\d+)?)$/)
    if (wallMatch) {
      return text.replace(trimmed, `墙体 ${wallMatch[1]}`)
    }

    // Pattern: "Slab 1", "Roof 1", etc. — numbered element labels
    const elementMatch = trimmed.match(/^(Slab|Ceiling|Door|Window|Fence|Stair|Item|Zone|Roof)\s+(\d+(-\d+)?)$/)
    if (elementMatch) {
      const typeMap = { Slab: '楼板', Ceiling: '天花板', Door: '门', Window: '窗', Fence: '围栏', Stair: '楼梯', Item: '物品', Zone: '区域', Roof: '屋顶' }
      const translated = typeMap[elementMatch[1]] || elementMatch[1]
      return text.replace(trimmed, `${translated} ${elementMatch[2]}`)
    }

    // Pattern: "Room1 Slab", "Room 1 Ceiling" → "房间 1 楼板/天花板"
    const roomSurfaceMatch = trimmed.match(/^Room\s*(\d+)\s+(Slab|Ceiling)$/i)
    if (roomSurfaceMatch) {
      const surfaceMap = { Slab: '楼板', Ceiling: '天花板' }
      const surfaceKey = roomSurfaceMatch[2].toLowerCase() === 'ceiling' ? 'Ceiling' : 'Slab'
      const surface = surfaceMap[surfaceKey]
      return text.replace(trimmed, `房间 ${roomSurfaceMatch[1]} ${surface}`)
    }

    // Pattern: "Slab (12.3m²)", "Ceiling (12.3m²)" → localized type with measurement intact.
    const surfaceAreaMatch = trimmed.match(/^(Slab|Ceiling)\s+(\(.+\))$/)
    if (surfaceAreaMatch) {
      const surfaceMap = { Slab: '楼板', Ceiling: '天花板' }
      return text.replace(trimmed, `${surfaceMap[surfaceAreaMatch[1]]} ${surfaceAreaMatch[2]}`)
    }

    // Pattern: "Building 1" → "建筑 1"
    const buildingMatch = trimmed.match(/^Building\s+(\d+)$/)
    if (buildingMatch) {
      return text.replace(trimmed, `建筑 ${buildingMatch[1]}`)
    }

    // Pattern: "Wall 22 Chamfer", "墙体 22 Offset" → localized suffix
    const wallEditSuffixMatch = trimmed.match(/^(.+?)\s+(Offset|Fillet|Chamfer)$/)
    if (wallEditSuffixMatch) {
      const suffixMap = { Offset: '偏移', Fillet: '圆角', Chamfer: '倒角' }
      return text.replace(trimmed, `${wallEditSuffixMatch[1]} ${suffixMap[wallEditSuffixMatch[2]]}`)
    }

    // Pattern: "Grid snap: 0.10" → "网格吸附：0.10"
    const gridSnapMatch = trimmed.match(/^Grid snap:\s+(.+)$/)
    if (gridSnapMatch) {
      return text.replace(trimmed, `网格吸附：${gridSnapMatch[1]}`)
    }

    // Case-insensitive fallback — try matching lowercase version
    const lowerKey = trimmed.toLowerCase()
    for (const [en, zh] of Object.entries(T)) {
      if (en.toLowerCase() === lowerKey) {
        return text.replace(trimmed, zh)
      }
    }

    return text
  }

  // ── Check if an element is inside an SVG context ──
  function isInSVG(el) {
    if (SVG_TAGS.has(el.tagName.toLowerCase())) return true
    // Check if it's an SVGElement instance (covers all SVG elements)
    if (el instanceof SVGElement) return true
    return false
  }

  // ── Translate an element's text content ──
  function translateElement(el) {
    if (translatedNodes.has(el)) return
    if (SKIP_TAGS.has(el.tagName)) return
    // CRITICAL: Skip all SVG elements — 2D floorplan is entirely SVG-based
    if (isInSVG(el)) return

    // Translate text nodes
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const translated = translateText(node.textContent)
        if (translated !== node.textContent) {
          node.textContent = translated
        }
      }
    }

    // Translate attributes
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr)
      if (val) {
        const translated = translateText(val)
        if (translated !== val) {
          el.setAttribute(attr, translated)
        }
      }
    }

    translatedNodes.add(el)
  }

  // ── Process all existing DOM content ──
  function translateDocument() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
    )
    let node
    while ((node = walker.nextNode())) {
      translateElement(node)
    }
  }

  // ── Watch for DOM changes and translate new content ──
  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Skip SVG mutations entirely for performance
        if (mutation.target instanceof SVGElement) continue
        // Handle added nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            translateElement(node)
            // Also translate children
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT)
            let child
            while ((child = walker.nextNode())) {
              translateElement(child)
            }
          }
        }

        // Handle text changes
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement
          if (parent && !SKIP_TAGS.has(parent.tagName)) {
            translatedNodes.delete(parent)
            translateElement(parent)
          }
        }

        // Handle attribute changes
        if (mutation.type === 'attributes') {
          const target = mutation.target
          if (target.nodeType === Node.ELEMENT_NODE) {
            const attrName = mutation.attributeName
            if (TRANSLATABLE_ATTRS.includes(attrName)) {
              const val = target.getAttribute(attrName)
              if (val) {
                const translated = translateText(val)
                if (translated !== val) {
                  target.setAttribute(attrName, translated)
                }
              }
            }
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS,
    })
  }

  // ── Initialize ──
  function init() {
    const language = getEditorLanguage()
    applyDocumentLanguage(language)

    if (language === 'en') {
      console.log('[建筑王 i18n] Editor language is English; localization overlay disabled')
      return
    }

    console.log('[建筑王 i18n] Starting Chinese localization')

    // Initial pass — translate any text already in DOM
    if (document.body) {
      translateDocument()
    }

    // Start observing — only watch for newly added nodes (don't re-scan whole DOM)
    startObserver()
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()

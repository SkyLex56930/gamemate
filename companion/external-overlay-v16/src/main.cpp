#define NOMINMAX
#include <Windows.h>
#include <dwmapi.h>
#include <mmdeviceapi.h>
#include <propkeydef.h>
#include <propsys.h>
#include <propvarutil.h>
#include <shellapi.h>
#include <windowsx.h>

#include <algorithm>
#include <array>
#include <cstdlib>
#include <cwchar>
#include <filesystem>
#include <iterator>
#include <string>
#include <utility>
#include <vector>

namespace {
const PROPERTYKEY kDeviceFriendlyName = {
    {0xa45c254e, 0xdf1c, 0x4efd, {0x80, 0x20, 0x67, 0xd1, 0x46, 0xa8, 0x50, 0xe0}},
    14};
constexpr wchar_t kWindowClass[] = L"GameMateExternalOverlayV16_5";
constexpr wchar_t kWindowTitle[] = L"Game Mate Overlay V16.5";
constexpr UINT kTrayMessage = WM_APP + 16;
constexpr UINT kTimerId = 16;
constexpr int kHotkeyId = 1600;
constexpr int kTrayId = 1601;
constexpr int kExitCommand = 1602;
constexpr int kCloseHotkeyId = 1603;
constexpr int kPanelWidth = 1040;
constexpr int kPanelHeight = 650;
constexpr int kHomeWidth = 760;
constexpr int kHomeHeight = 700;
constexpr int kSidebarWidth = 92;
constexpr int kHeaderHeight = 72;
enum class Page : int { Home, Friends, Messages, Squad, Profile, Audio };

struct ChatLine {
  std::wstring author;
  std::wstring text;
  std::wstring time;
  bool mine;
};

struct Conversation {
  std::wstring name;
  std::wstring activity;
  std::wstring preview;
  std::wstring time;
  int unread;
  bool online;
  COLORREF accent;
  std::vector<ChatLine> messages;
};

struct FriendInfo {
  std::wstring name;
  std::wstring activity;
  std::wstring status;
  bool online;
  int conversationIndex;
  COLORREF accent;
};

struct SquadMember {
  std::wstring name;
  bool muted;
  COLORREF accent;
};

HWND g_overlay = nullptr;
HWND g_target = nullptr;
HFONT g_logoFont = nullptr;
HFONT g_titleFont = nullptr;
HFONT g_bodyFont = nullptr;
HFONT g_smallFont = nullptr;
HFONT g_tinyFont = nullptr;
HBRUSH g_backgroundBrush = nullptr;
bool g_visible = false;
bool g_microphoneMuted = false;
bool g_deafened = false;
bool g_inSquad = false;
bool g_testingMicrophone = false;
bool g_dragging = false;
bool g_userPositioned = false;
int g_inputDevice = 0;
int g_outputDevice = 0;
int g_inputVolume = 78;
int g_outputVolume = 64;
int g_savedX = 0;
int g_savedY = 0;
int g_selectedConversation = 0;
Page g_page = Page::Home;
ULONGLONG g_lastStateLoad = 0;
std::filesystem::file_time_type g_lastStateWriteTime{};
bool g_hasStateWriteTime = false;
bool g_onlineFriendsOnly = false;
POINT g_dragStartCursor{};
RECT g_dragStartWindow{};
std::wstring g_profileName;
std::wstring g_profileStatus;
std::wstring g_profileLevel = L"—";
std::wstring g_profileRank = L"—";
std::wstring g_profilePlaytime = L"—";
int g_profileCompletion = 0;
std::wstring g_inputOverride;
std::wstring g_outputOverride;
std::wstring g_targetName = L"Aucun jeu";
std::wstring g_targetTitle;
std::wstring g_mode = L"En attente";

std::vector<std::wstring> g_inputDevices = {L"Périphérique d'entrée par défaut"};
std::vector<std::wstring> g_outputDevices = {L"Périphérique de sortie par défaut"};

std::vector<Conversation> g_conversations;
std::vector<FriendInfo> g_friends;
std::vector<SquadMember> g_squadMembers;

int currentPanelWidth() {
  return g_page == Page::Home ? kHomeWidth : kPanelWidth;
}

int currentPanelHeight() {
  return g_page == Page::Home ? kHomeHeight : kPanelHeight;
}

void copyText(wchar_t* destination, size_t capacity, const std::wstring& value) {
  if (capacity == 0) return;
  wcsncpy_s(destination, capacity, value.c_str(), _TRUNCATE);
}

std::filesystem::path executableDirectory() {
  std::wstring buffer(32768, L'\0');
  const DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  if (length == 0 || length >= buffer.size()) return std::filesystem::current_path();
  buffer.resize(length);
  return std::filesystem::path(buffer).parent_path();
}

std::wstring readIniText(const std::filesystem::path& path, const wchar_t* section,
                         const wchar_t* key, const wchar_t* fallback) {
  wchar_t value[512]{};
  GetPrivateProfileStringW(section, key, fallback, value, static_cast<DWORD>(std::size(value)),
                           path.c_str());
  return value;
}

int readIniInt(const std::filesystem::path& path, const wchar_t* section,
               const wchar_t* key, int fallback) {
  return static_cast<int>(GetPrivateProfileIntW(section, key, fallback, path.c_str()));
}

bool loadCompanionState(bool force = false) {
  const ULONGLONG now = GetTickCount64();
  if (!force && now - g_lastStateLoad < 1000) return false;
  g_lastStateLoad = now;
  const std::filesystem::path path = executableDirectory() / L"companion-overlay-state.ini";
  if (!std::filesystem::exists(path)) return false;
  const auto writeTime = std::filesystem::last_write_time(path);
  if (!force && g_hasStateWriteTime && writeTime == g_lastStateWriteTime) return false;
  g_lastStateWriteTime = writeTime;
  g_hasStateWriteTime = true;

  g_profileName = readIniText(path, L"profile", L"name", L"");
  g_profileStatus = readIniText(path, L"profile", L"status", L"");
  g_profileLevel = readIniText(path, L"profile", L"level", L"—");
  g_profileRank = readIniText(path, L"profile", L"rank", L"—");
  g_profilePlaytime = readIniText(path, L"profile", L"playtime", L"—");
  g_profileCompletion = std::clamp(readIniInt(path, L"profile", L"completion", 0), 0, 100);
  g_inputOverride = readIniText(path, L"audio", L"input", L"");
  g_outputOverride = readIniText(path, L"audio", L"output", L"");
  g_inputVolume = std::clamp(readIniInt(path, L"audio", L"input_volume", g_inputVolume), 0, 100);
  g_outputVolume = std::clamp(readIniInt(path, L"audio", L"output_volume", g_outputVolume), 0, 100);
  g_microphoneMuted = readIniInt(path, L"audio", L"microphone_muted", 0) == 1;
  g_deafened = readIniInt(path, L"audio", L"deafened", 0) == 1;
  g_inSquad = readIniInt(path, L"squad", L"connected", 0) == 1;

  const bool hasPosition = readIniInt(path, L"overlay", L"has_position", 0) == 1;
  if (hasPosition) {
    g_savedX = readIniInt(path, L"overlay", L"x", g_savedX);
    g_savedY = readIniInt(path, L"overlay", L"y", g_savedY);
    g_userPositioned = true;
  }

  const std::array<COLORREF, 5> accents = {
      RGB(130, 76, 255), RGB(42, 220, 234), RGB(222, 57, 194),
      RGB(21, 190, 137), RGB(255, 164, 73)};
  std::vector<Conversation> conversations;
  const int conversationCount = std::clamp(readIniInt(path, L"conversations", L"count", 0), 0, 8);
  for (int i = 1; i <= conversationCount; ++i) {
    const std::wstring section = L"conversation" + std::to_wstring(i);
    Conversation item{};
    item.name = readIniText(path, section.c_str(), L"name", L"");
    if (item.name.empty()) continue;
    item.activity = readIniText(path, section.c_str(), L"activity", L"");
    item.preview = readIniText(path, section.c_str(), L"preview", L"");
    item.time = readIniText(path, section.c_str(), L"time", L"");
    item.unread = std::max(0, readIniInt(path, section.c_str(), L"unread", 0));
    item.online = readIniInt(path, section.c_str(), L"online", 0) == 1;
    item.accent = accents[static_cast<size_t>((i - 1) % static_cast<int>(accents.size()))];
    const int messageCount = std::clamp(readIniInt(path, section.c_str(), L"message_count", 0), 0, 6);
    for (int messageIndex = 1; messageIndex <= messageCount; ++messageIndex) {
      const std::wstring messageSection = section + L"_message" + std::to_wstring(messageIndex);
      ChatLine line{};
      line.author = readIniText(path, messageSection.c_str(), L"author", L"");
      line.text = readIniText(path, messageSection.c_str(), L"text", L"");
      line.time = readIniText(path, messageSection.c_str(), L"time", L"");
      line.mine = readIniInt(path, messageSection.c_str(), L"mine", 0) == 1;
      if (!line.text.empty()) item.messages.push_back(line);
    }
    conversations.push_back(item);
  }

  std::vector<FriendInfo> friends;
  const int friendCount = std::clamp(readIniInt(path, L"friends", L"count", 0), 0, 8);
  for (int i = 1; i <= friendCount; ++i) {
    const std::wstring section = L"friend" + std::to_wstring(i);
    FriendInfo item{};
    item.name = readIniText(path, section.c_str(), L"name", L"");
    if (item.name.empty()) continue;
    item.activity = readIniText(path, section.c_str(), L"activity", L"");
    item.status = readIniText(path, section.c_str(), L"status", L"");
    item.online = readIniInt(path, section.c_str(), L"online", 0) == 1;
    item.conversationIndex = readIniInt(path, section.c_str(), L"conversation_index", -1);
    item.accent = accents[static_cast<size_t>((i - 1) % static_cast<int>(accents.size()))];
    friends.push_back(item);
  }

  std::vector<SquadMember> squadMembers;
  const int squadMemberCount = std::clamp(readIniInt(path, L"squad", L"member_count", 0), 0, 5);
  for (int i = 1; i <= squadMemberCount; ++i) {
    const std::wstring section = L"squad_member" + std::to_wstring(i);
    SquadMember item{};
    item.name = readIniText(path, section.c_str(), L"name", L"");
    if (item.name.empty()) continue;
    item.muted = readIniInt(path, section.c_str(), L"muted", 0) == 1;
    item.accent = accents[static_cast<size_t>((i - 1) % static_cast<int>(accents.size()))];
    squadMembers.push_back(item);
  }
  g_conversations = std::move(conversations);
  g_friends = std::move(friends);
  g_squadMembers = std::move(squadMembers);
  if (g_conversations.empty()) g_selectedConversation = 0;
  else g_selectedConversation = std::clamp(g_selectedConversation, 0,
                                            static_cast<int>(g_conversations.size()) - 1);
  return true;
}

void writeAudioState(const wchar_t* key, const std::wstring& value) {
  const std::filesystem::path path = executableDirectory() / L"companion-overlay-state.ini";
  WritePrivateProfileStringW(L"audio", key, value.c_str(), path.c_str());
}

void writeIniNumber(const wchar_t* section, const wchar_t* key, int value) {
  const std::filesystem::path path = executableDirectory() / L"companion-overlay-state.ini";
  const std::wstring text = std::to_wstring(value);
  WritePrivateProfileStringW(section, key, text.c_str(), path.c_str());
}

std::wstring audioDeviceName(IMMDevice* device) {
  if (!device) return {};
  IPropertyStore* properties = nullptr;
  if (FAILED(device->OpenPropertyStore(STGM_READ, &properties)) || !properties) return {};
  PROPVARIANT value{};
  PropVariantInit(&value);
  std::wstring result;
  if (SUCCEEDED(properties->GetValue(kDeviceFriendlyName, &value)) &&
      value.vt == VT_LPWSTR && value.pwszVal) result = value.pwszVal;
  PropVariantClear(&value);
  properties->Release();
  return result;
}

std::vector<std::wstring> enumerateAudioDevices(IMMDeviceEnumerator* enumerator,
                                                EDataFlow flow,
                                                const std::wstring& fallback) {
  std::vector<std::wstring> result;
  if (!enumerator) {
    result.push_back(fallback);
    return result;
  }
  IMMDevice* defaultDevice = nullptr;
  if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(flow, eConsole, &defaultDevice)) &&
      defaultDevice) {
    const std::wstring name = audioDeviceName(defaultDevice);
    result.push_back(name.empty() ? fallback : L"Par défaut — " + name);
    defaultDevice->Release();
  }
  IMMDeviceCollection* collection = nullptr;
  if (SUCCEEDED(enumerator->EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, &collection)) &&
      collection) {
    UINT count = 0;
    collection->GetCount(&count);
    for (UINT i = 0; i < count; ++i) {
      IMMDevice* device = nullptr;
      if (SUCCEEDED(collection->Item(i, &device)) && device) {
        const std::wstring name = audioDeviceName(device);
        if (!name.empty() && std::find(result.begin(), result.end(), name) == result.end())
          result.push_back(name);
        device->Release();
      }
    }
    collection->Release();
  }
  if (result.empty()) result.push_back(fallback);
  return result;
}

void refreshAudioDevices() {
  IMMDeviceEnumerator* enumerator = nullptr;
  if (SUCCEEDED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                 __uuidof(IMMDeviceEnumerator),
                                 reinterpret_cast<void**>(&enumerator))) && enumerator) {
    g_inputDevices = enumerateAudioDevices(enumerator, eCapture,
                                           L"Périphérique d'entrée par défaut");
    g_outputDevices = enumerateAudioDevices(enumerator, eRender,
                                            L"Périphérique de sortie par défaut");
    enumerator->Release();
  }
}

bool inside(int x, int y, const RECT& area) {
  return x >= area.left && x < area.right && y >= area.top && y < area.bottom;
}

void fillRectColor(HDC dc, const RECT& area, COLORREF color) {
  HBRUSH brush = CreateSolidBrush(color);
  FillRect(dc, &area, brush);
  DeleteObject(brush);
}

void fillRounded(HDC dc, const RECT& area, int radius, COLORREF color) {
  HRGN region = CreateRoundRectRgn(area.left, area.top, area.right + 1, area.bottom + 1,
                                   radius, radius);
  HBRUSH brush = CreateSolidBrush(color);
  FillRgn(dc, region, brush);
  DeleteObject(brush);
  DeleteObject(region);
}

void strokeRounded(HDC dc, const RECT& area, int radius, COLORREF color, int width = 1) {
  HPEN pen = CreatePen(PS_SOLID, width, color);
  HPEN oldPen = static_cast<HPEN>(SelectObject(dc, pen));
  HBRUSH oldBrush = static_cast<HBRUSH>(SelectObject(dc, GetStockObject(HOLLOW_BRUSH)));
  RoundRect(dc, area.left, area.top, area.right, area.bottom, radius, radius);
  SelectObject(dc, oldBrush);
  SelectObject(dc, oldPen);
  DeleteObject(pen);
}

void drawLine(HDC dc, int x1, int y1, int x2, int y2, COLORREF color, int width = 2) {
  HPEN pen = CreatePen(PS_SOLID, width, color);
  HPEN oldPen = static_cast<HPEN>(SelectObject(dc, pen));
  MoveToEx(dc, x1, y1, nullptr);
  LineTo(dc, x2, y2);
  SelectObject(dc, oldPen);
  DeleteObject(pen);
}

void drawTextLine(HDC dc, HFONT font, COLORREF color, const std::wstring& value,
                  RECT area, UINT format = DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS) {
  HFONT previous = static_cast<HFONT>(SelectObject(dc, font));
  SetTextColor(dc, color);
  SetBkMode(dc, TRANSPARENT);
  DrawTextW(dc, value.c_str(), -1, &area, format);
  SelectObject(dc, previous);
}

void drawDot(HDC dc, int x, int y, int radius, COLORREF color) {
  HBRUSH brush = CreateSolidBrush(color);
  HBRUSH oldBrush = static_cast<HBRUSH>(SelectObject(dc, brush));
  HPEN pen = CreatePen(PS_NULL, 0, color);
  HPEN oldPen = static_cast<HPEN>(SelectObject(dc, pen));
  Ellipse(dc, x - radius, y - radius, x + radius, y + radius);
  SelectObject(dc, oldPen);
  SelectObject(dc, oldBrush);
  DeleteObject(pen);
  DeleteObject(brush);
}

void drawAvatar(HDC dc, int x, int y, int size, COLORREF color, const std::wstring& name) {
  drawDot(dc, x + size / 2, y + size / 2, size / 2 + 2, RGB(57, 210, 255));
  RECT avatar{x, y, x + size, y + size};
  fillRounded(dc, avatar, size, color);
  RECT letter = avatar;
  std::wstring first = name.empty() ? L"?" : name.substr(0, 1);
  drawTextLine(dc, g_bodyFont, RGB(255, 255, 255), first, letter,
               DT_CENTER | DT_SINGLELINE | DT_VCENTER);
}

void drawGamepadLogo(HDC dc, int x, int y) {
  RECT body{x, y + 5, x + 42, y + 31};
  fillRounded(dc, body, 18, RGB(58, 84, 255));
  strokeRounded(dc, body, 18, RGB(56, 218, 255), 2);
  drawLine(dc, x + 10, y + 18, x + 22, y + 18, RGB(230, 248, 255), 2);
  drawLine(dc, x + 16, y + 12, x + 16, y + 24, RGB(230, 248, 255), 2);
  drawDot(dc, x + 31, y + 14, 2, RGB(238, 245, 255));
  drawDot(dc, x + 35, y + 21, 2, RGB(238, 245, 255));
}

void drawNavGlyph(HDC dc, int index, int cx, int cy, COLORREF color) {
  HPEN pen = CreatePen(PS_SOLID, 2, color);
  HPEN oldPen = static_cast<HPEN>(SelectObject(dc, pen));
  HBRUSH oldBrush = static_cast<HBRUSH>(SelectObject(dc, GetStockObject(HOLLOW_BRUSH)));
  if (index == 0) {
    POINT roof[3] = {{cx - 10, cy - 2}, {cx, cy - 11}, {cx + 10, cy - 2}};
    Polyline(dc, roof, 3);
    Rectangle(dc, cx - 7, cy - 2, cx + 8, cy + 10);
  } else if (index == 1) {
    Ellipse(dc, cx - 5, cy - 11, cx + 5, cy - 1);
    Arc(dc, cx - 11, cy - 1, cx + 11, cy + 14, cx - 11, cy + 10, cx + 11, cy + 10);
  } else if (index == 2) {
    RoundRect(dc, cx - 11, cy - 9, cx + 11, cy + 7, 8, 8);
    drawLine(dc, cx - 5, cy + 6, cx - 9, cy + 12, color, 2);
  } else if (index == 3) {
    Arc(dc, cx - 11, cy - 10, cx + 11, cy + 12, cx - 11, cy + 1, cx + 11, cy + 1);
    drawLine(dc, cx - 11, cy, cx - 11, cy + 8, color, 3);
    drawLine(dc, cx + 11, cy, cx + 11, cy + 8, color, 3);
  } else if (index == 4) {
    Ellipse(dc, cx - 6, cy - 11, cx + 6, cy + 1);
    Arc(dc, cx - 12, cy, cx + 12, cy + 15, cx - 12, cy + 11, cx + 12, cy + 11);
  } else {
    Ellipse(dc, cx - 8, cy - 8, cx + 8, cy + 8);
    Ellipse(dc, cx - 2, cy - 2, cx + 2, cy + 2);
    drawLine(dc, cx, cy - 13, cx, cy - 8, color, 2);
    drawLine(dc, cx, cy + 8, cx, cy + 13, color, 2);
    drawLine(dc, cx - 13, cy, cx - 8, cy, color, 2);
    drawLine(dc, cx + 8, cy, cx + 13, cy, color, 2);
  }
  SelectObject(dc, oldBrush);
  SelectObject(dc, oldPen);
  DeleteObject(pen);
}

void drawButton(HDC dc, const RECT& area, const std::wstring& label, bool active = false,
                COLORREF accent = RGB(130, 76, 255)) {
  fillRounded(dc, area, 14, active ? accent : RGB(10, 26, 48));
  drawTextLine(dc, g_smallFont, active ? RGB(7, 15, 31) : RGB(218, 227, 246), label, area,
               DT_CENTER | DT_SINGLELINE | DT_VCENTER);
}

std::wstring fileNameForWindow(HWND window) {
  DWORD processId = 0;
  GetWindowThreadProcessId(window, &processId);
  if (!processId) return L"Application inconnue";
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
  if (!process) return L"Application Windows";
  std::wstring path(32768, L'\0');
  DWORD size = static_cast<DWORD>(path.size());
  if (QueryFullProcessImageNameW(process, 0, path.data(), &size)) path.resize(size);
  else path.clear();
  CloseHandle(process);
  if (path.empty()) return L"Application Windows";
  return std::filesystem::path(path).filename().wstring();
}

std::wstring titleForWindow(HWND window) {
  const int length = GetWindowTextLengthW(window);
  if (length <= 0) return {};
  std::wstring title(static_cast<size_t>(length) + 1, L'\0');
  GetWindowTextW(window, title.data(), length + 1);
  title.resize(wcslen(title.c_str()));
  return title;
}

struct CompanionWindowSearch {
  HWND found = nullptr;
};

BOOL CALLBACK findCompanionWindow(HWND window, LPARAM parameter) {
  auto* search = reinterpret_cast<CompanionWindowSearch*>(parameter);
  if (!IsWindowVisible(window) || window == g_overlay) return TRUE;
  const std::wstring executable = fileNameForWindow(window);
  if (_wcsicmp(executable.c_str(), L"companion.exe") != 0) return TRUE;
  search->found = window;
  return FALSE;
}

bool focusRunningCompanion() {
  CompanionWindowSearch search{};
  EnumWindows(findCompanionWindow, reinterpret_cast<LPARAM>(&search));
  if (!search.found) return false;
  if (IsIconic(search.found)) ShowWindow(search.found, SW_RESTORE);
  SetForegroundWindow(search.found);
  return true;
}

void requestCompanionAction(const std::wstring& action) {
  const std::filesystem::path statePath = executableDirectory() / L"companion-overlay-state.ini";
  WritePrivateProfileStringW(L"actions", L"requested", action.c_str(), statePath.c_str());
  const std::wstring nonce = std::to_wstring(GetTickCount64());
  WritePrivateProfileStringW(L"actions", L"nonce", nonce.c_str(), statePath.c_str());
  g_visible = false;
  UnregisterHotKey(g_overlay, kCloseHotkeyId);
  ShowWindow(g_overlay, SW_HIDE);
  if (focusRunningCompanion()) return;

  const std::filesystem::path root = executableDirectory().parent_path().parent_path();
  const std::array<std::filesystem::path, 5> candidates = {
      root / L"target" / L"release" / L"companion.exe",
      root / L"target" / L"debug" / L"companion.exe",
      root / L"src-tauri" / L"target" / L"release" / L"companion.exe",
      root / L"src-tauri" / L"target" / L"debug" / L"companion.exe",
      root / L"companion.exe"};
  for (const auto& candidate : candidates) {
    if (!std::filesystem::exists(candidate)) continue;
    const auto result = reinterpret_cast<INT_PTR>(
        ShellExecuteW(nullptr, L"open", candidate.c_str(), nullptr, root.c_str(), SW_SHOWNORMAL));
    if (result > 32) return;
  }
  MessageBoxW(g_overlay,
              L"Le Companion n'a pas été trouvé automatiquement. Lance companion.exe puis réessaie.",
              kWindowTitle, MB_OK | MB_ICONINFORMATION);
}

bool isUsableTarget(HWND window) {
  if (!window || window == g_overlay || window == GetShellWindow() ||
      window == GetDesktopWindow() || !IsWindowVisible(window) || IsIconic(window)) return false;
  wchar_t className[128]{};
  GetClassNameW(window, className, static_cast<int>(std::size(className)));
  const std::wstring value(className);
  return value != L"Progman" && value != L"WorkerW" && value != L"Shell_TrayWnd";
}

RECT extendedBounds(HWND window) {
  RECT result{};
  if (FAILED(DwmGetWindowAttribute(window, DWMWA_EXTENDED_FRAME_BOUNDS,
                                   &result, sizeof(result)))) GetWindowRect(window, &result);
  return result;
}

bool updateTargetMode() {
  const std::wstring previous = g_mode;
  if (!IsWindow(g_target)) {
    g_mode = L"Fenêtre fermée";
    return g_mode != previous;
  }
  const RECT target = extendedBounds(g_target);
  HMONITOR monitor = MonitorFromWindow(g_target, MONITOR_DEFAULTTONEAREST);
  MONITORINFO info{sizeof(MONITORINFO)};
  if (!GetMonitorInfoW(monitor, &info)) {
    g_mode = L"Jeu détecté";
    return g_mode != previous;
  }
  constexpr LONG tolerance = 4;
  const bool fillsMonitor = std::labs(target.left - info.rcMonitor.left) <= tolerance &&
                            std::labs(target.top - info.rcMonitor.top) <= tolerance &&
                            std::labs(target.right - info.rcMonitor.right) <= tolerance &&
                            std::labs(target.bottom - info.rcMonitor.bottom) <= tolerance;
  g_mode = fillsMonitor ? L"Sans bordure détecté" : L"Fenêtré détecté";
  return g_mode != previous;
}

void positionOverlay() {
  if (!g_visible || !IsWindow(g_target)) return;
  HMONITOR monitor = MonitorFromWindow(g_target, MONITOR_DEFAULTTONEAREST);
  MONITORINFO info{sizeof(MONITORINFO)};
  if (!GetMonitorInfoW(monitor, &info)) return;
  const int monitorWidth = static_cast<int>(info.rcMonitor.right - info.rcMonitor.left);
  const int monitorHeight = static_cast<int>(info.rcMonitor.bottom - info.rcMonitor.top);
  const int width = currentPanelWidth();
  const int height = currentPanelHeight();
  int x = static_cast<int>(info.rcMonitor.left) + (monitorWidth - width) / 2;
  int y = static_cast<int>(info.rcMonitor.top) + (monitorHeight - height) / 2;
  if (g_userPositioned) {
    const int minimumX = static_cast<int>(info.rcMonitor.left);
    const int maximumX = std::max(minimumX, static_cast<int>(info.rcMonitor.right) - width);
    const int minimumY = static_cast<int>(info.rcMonitor.top);
    const int maximumY = std::max(minimumY, static_cast<int>(info.rcMonitor.bottom) - height);
    x = std::clamp(g_savedX, minimumX, maximumX);
    y = std::clamp(g_savedY, minimumY, maximumY);
  }
  SetWindowPos(g_overlay, HWND_TOPMOST, x, y, width, height,
               SWP_NOACTIVATE | SWP_SHOWWINDOW);
}

void applyWindowShape() {
  // Fenêtre volontairement rectangulaire et entièrement opaque.
  // Aucun masque de région : aucun coin ne laisse apparaître le jeu.
}

void switchPage(Page page) {
  if (g_page == page) return;
  g_page = page;
  applyWindowShape();
  if (g_visible) positionOverlay();
  InvalidateRect(g_overlay, nullptr, FALSE);
}

void hideOverlay() {
  g_visible = false;
  UnregisterHotKey(g_overlay, kCloseHotkeyId);
  ShowWindow(g_overlay, SW_HIDE);
}

void showForForegroundWindow() {
  HWND candidate = GetForegroundWindow();
  if (!isUsableTarget(candidate)) {
    MessageBeep(MB_ICONWARNING);
    return;
  }
  g_target = candidate;
  g_targetName = fileNameForWindow(candidate);
  g_targetTitle = titleForWindow(candidate);
  loadCompanionState(true);
  updateTargetMode();
  g_visible = true;
  RegisterHotKey(g_overlay, kCloseHotkeyId, MOD_NOREPEAT, VK_ESCAPE);
  applyWindowShape();
  positionOverlay();
  InvalidateRect(g_overlay, nullptr, FALSE);
}

void addTrayIcon(HWND window) {
  NOTIFYICONDATAW icon{sizeof(NOTIFYICONDATAW)};
  icon.hWnd = window;
  icon.uID = kTrayId;
  icon.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  icon.uCallbackMessage = kTrayMessage;
  icon.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
  copyText(icon.szTip, std::size(icon.szTip), L"Game Mate Overlay V16.5 — Ctrl+G");
  Shell_NotifyIconW(NIM_ADD, &icon);
  icon.uFlags = NIF_INFO;
  copyText(icon.szInfoTitle, std::size(icon.szInfoTitle), L"Game Mate Overlay V16.5");
  copyText(icon.szInfo, std::size(icon.szInfo),
           L"Prêt. Lance un jeu sans bordure puis utilise Ctrl+G.");
  icon.dwInfoFlags = NIIF_INFO;
  Shell_NotifyIconW(NIM_MODIFY, &icon);
}

void removeTrayIcon(HWND window) {
  NOTIFYICONDATAW icon{sizeof(NOTIFYICONDATAW)};
  icon.hWnd = window;
  icon.uID = kTrayId;
  Shell_NotifyIconW(NIM_DELETE, &icon);
}

void showTrayMenu(HWND window) {
  HMENU menu = CreatePopupMenu();
  AppendMenuW(menu, MF_STRING, kExitCommand, L"Quitter Game Mate Overlay");
  POINT point{};
  GetCursorPos(&point);
  SetForegroundWindow(window);
  TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_BOTTOMALIGN | TPM_LEFTALIGN,
                 point.x, point.y, 0, window, nullptr);
  DestroyMenu(menu);
}

const wchar_t* pageTitle() {
  switch (g_page) {
    case Page::Home: return L"Accueil";
    case Page::Friends: return L"Amis";
    case Page::Messages: return L"Messages";
    case Page::Squad: return L"Squad & vocal";
    case Page::Profile: return L"Mon profil";
    case Page::Audio: return L"Paramètres de l'overlay";
  }
  return L"Game Mate";
}

void paintSidebar(HDC dc) {
  const int panelHeight = currentPanelHeight();
  RECT sidebar{0, 0, kSidebarWidth, panelHeight};
  fillRectColor(dc, sidebar, RGB(3, 10, 24));
  RECT sidebarGlow{kSidebarWidth - 2, 18, kSidebarWidth, panelHeight - 18};
  fillRounded(dc, sidebarGlow, 2, RGB(74, 77, 174));
  drawGamepadLogo(dc, 25, 18);

  const std::array<std::wstring, 6> labels = {
      L"Accueil", L"Amis", L"Msgs", L"Vocal", L"Profil", L"Régl."};
  for (int i = 0; i < 6; ++i) {
    const int y = 84 + i * 78;
    const bool active = static_cast<int>(g_page) == i;
    RECT item{12, y, 80, y + 66};
    if (active) {
      fillRounded(dc, item, 18, RGB(35, 42, 111));
      strokeRounded(dc, item, 18, RGB(99, 74, 255), 2);
      RECT marker{12, y + 16, 15, y + 50};
      fillRounded(dc, marker, 4, RGB(41, 213, 255));
    }
    drawNavGlyph(dc, i, 46, y + 24,
                 active ? RGB(77, 225, 255) : RGB(142, 155, 191));
    RECT labelArea{12, y + 40, 80, y + 62};
    drawTextLine(dc, g_tinyFont, active ? RGB(225, 241, 255) : RGB(112, 126, 158),
                 labels[static_cast<size_t>(i)], labelArea,
                 DT_CENTER | DT_SINGLELINE | DT_VCENTER);
  }
}

void paintHeader(HDC dc) {
  const int panelWidth = currentPanelWidth();
  RECT header{kSidebarWidth, 0, panelWidth, kHeaderHeight};
  fillRectColor(dc, header, RGB(4, 12, 28));
  if (g_page == Page::Home) {
    drawTextLine(dc, g_titleFont, RGB(245, 249, 255), L"Game", RECT{116, 10, 180, 43});
    drawTextLine(dc, g_titleFont, RGB(51, 212, 255), L"Mate", RECT{175, 10, 245, 43});
    drawTextLine(dc, g_tinyFont, RGB(91, 147, 255), L"P L A Y   T O G E T H E R",
                 RECT{116, 40, 310, 64});
  } else {
    RECT title{kSidebarWidth + 26, 11, kSidebarWidth + 330, 48};
    drawTextLine(dc, g_titleFont, RGB(242, 247, 255), pageTitle(), title);
    RECT game{kSidebarWidth + 26, 43, kSidebarWidth + 520, 66};
    drawTextLine(dc, g_tinyFont, RGB(115, 226, 171),
                 L"● " + g_targetName + L"  •  " + g_mode, game);
  }
  RECT status{panelWidth - 244, 15, panelWidth - 94, 57};
  fillRounded(dc, status, 16, RGB(13, 28, 55));
  strokeRounded(dc, status, 16, RGB(37, 64, 112));
  drawDot(dc, status.left + 18, 36, 6, RGB(44, 231, 175));
  drawTextLine(dc, g_smallFont, RGB(209, 228, 249),
               g_targetName == L"Aucun jeu" ? L"En attente" : L"En jeu",
               RECT{status.left + 32, status.top, status.right - 8, status.bottom});
  RECT settings{panelWidth - 86, 17, panelWidth - 50, 55};
  drawNavGlyph(dc, 5, settings.left + 18, 36, RGB(159, 180, 221));
  RECT close{panelWidth - 46, 15, panelWidth - 8, 56};
  drawTextLine(dc, g_titleFont, RGB(210, 220, 240), L"×", close,
               DT_CENTER | DT_SINGLELINE | DT_VCENTER);
}

void paintHome(HDC dc) {
  const int left = kSidebarWidth + 16;
  const int right = kHomeWidth - 16;
  const int onlineCount = static_cast<int>(std::count_if(
      g_friends.begin(), g_friends.end(), [](const FriendInfo& item) { return item.online; }));
  int unreadCount = 0;
  for (const Conversation& conversation : g_conversations) unreadCount += conversation.unread;

  RECT friendsCard{left, 84, right, 316};
  fillRounded(dc, friendsCard, 18, RGB(10, 25, 51));
  strokeRounded(dc, friendsCard, 18, RGB(39, 61, 112));
  drawTextLine(dc, g_bodyFont, RGB(238, 244, 255),
               L"Amis en ligne (" + std::to_wstring(onlineCount) + L")",
               RECT{left + 18, 90, left + 330, 126});
  drawTextLine(dc, g_smallFont, RGB(145, 165, 207), L"Voir tous  ›",
               RECT{right - 126, 90, right - 14, 126}, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);

  int friendRow = 0;
  for (const FriendInfo& friendInfo : g_friends) {
    if (!friendInfo.online || friendRow >= 4) continue;
    const int y = 130 + friendRow * 43;
    RECT row{left + 14, y, right - 14, y + 38};
    fillRounded(dc, row, 12, friendRow % 2 == 0 ? RGB(19, 37, 69) : RGB(16, 32, 61));
    strokeRounded(dc, row, 12, RGB(42, 62, 102));
    drawAvatar(dc, row.left + 8, y + 4, 30, friendInfo.accent, friendInfo.name);
    drawDot(dc, row.left + 35, y + 31, 4, RGB(48, 233, 174));
    drawTextLine(dc, g_smallFont, RGB(241, 246, 255), friendInfo.name,
                 RECT{row.left + 48, y, row.left + 248, y + 22});
    drawTextLine(dc, g_tinyFont, RGB(70, 225, 174),
                 friendInfo.status.empty() ? L"En jeu" : friendInfo.status,
                 RECT{row.left + 48, y + 18, row.left + 270, y + 38});
    drawTextLine(dc, g_smallFont, RGB(174, 191, 222), friendInfo.activity,
                 RECT{right - 220, y, right - 28, y + 38}, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
    ++friendRow;
  }
  if (friendRow == 0) {
    drawTextLine(dc, g_smallFont, RGB(137, 154, 190),
                 g_friends.empty() ? L"Connecte Companion pour synchroniser tes amis."
                                   : L"Aucun ami en ligne pour le moment.",
                 RECT{left + 28, 158, right - 28, 248},
                 DT_CENTER | DT_WORDBREAK | DT_VCENTER);
  }

  RECT chatCard{left, 326, right, 500};
  fillRounded(dc, chatCard, 18, RGB(10, 25, 51));
  strokeRounded(dc, chatCard, 18, RGB(39, 61, 112));
  drawTextLine(dc, g_bodyFont, RGB(238, 244, 255),
               L"Chat & invitations (" + std::to_wstring(unreadCount) + L")",
               RECT{left + 18, 332, left + 360, 366});
  drawTextLine(dc, g_smallFont, RGB(145, 165, 207), L"Voir tous  ›",
               RECT{right - 126, 332, right - 14, 366}, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);

  const int visibleConversations = std::min(2, static_cast<int>(g_conversations.size()));
  for (int i = 0; i < visibleConversations; ++i) {
    const Conversation& conversation = g_conversations[static_cast<size_t>(i)];
    const int y = 370 + i * 58;
    RECT row{left + 14, y, right - 14, y + 50};
    fillRounded(dc, row, 12, RGB(18, 35, 65));
    strokeRounded(dc, row, 12, RGB(41, 62, 103));
    drawAvatar(dc, row.left + 8, y + 7, 36, conversation.accent, conversation.name);
    drawDot(dc, row.left + 40, y + 40, 4,
            conversation.online ? RGB(48, 233, 174) : RGB(104, 116, 145));
    drawTextLine(dc, g_smallFont, RGB(242, 247, 255), conversation.name,
                 RECT{row.left + 54, y + 3, row.left + 254, y + 26});
    drawTextLine(dc, g_tinyFont, RGB(153, 169, 202), conversation.preview,
                 RECT{row.left + 54, y + 24, right - 178, y + 47});
    if (conversation.unread > 0) {
      RECT badge{right - 158, y + 12, right - 128, y + 40};
      fillRounded(dc, badge, 28, RGB(42, 205, 255));
      drawTextLine(dc, g_tinyFont, RGB(4, 14, 31), std::to_wstring(conversation.unread), badge,
                   DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    }
    drawButton(dc, RECT{right - 116, y + 8, right - 26, y + 42}, L"Message");
  }
  if (visibleConversations == 0) {
    drawTextLine(dc, g_smallFont, RGB(137, 154, 190),
                 L"Aucun message ou invitation synchronisé.",
                 RECT{left + 28, 376, right - 28, 474},
                 DT_CENTER | DT_SINGLELINE | DT_VCENTER);
  }

  RECT voiceCard{left, 510, right, 642};
  fillRounded(dc, voiceCard, 18, RGB(10, 25, 51));
  strokeRounded(dc, voiceCard, 18, RGB(39, 61, 112));
  drawTextLine(dc, g_bodyFont, RGB(238, 244, 255),
               L"Vocal / Escouade (" + std::to_wstring(g_squadMembers.size()) + L"/5)",
               RECT{left + 18, 516, left + 380, 550});
  drawTextLine(dc, g_tinyFont, g_inSquad ? RGB(58, 232, 176) : RGB(132, 149, 181),
               g_inSquad ? L"▮▮▮  Connecté" : L"●  Non connecté",
               RECT{right - 180, 516, right - 18, 550}, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);

  for (int i = 0; i < 5; ++i) {
    const int x = left + 28 + i * 82;
    if (i < static_cast<int>(g_squadMembers.size())) {
      const SquadMember& member = g_squadMembers[static_cast<size_t>(i)];
      drawAvatar(dc, x, 558, 38, member.accent, member.name);
      drawDot(dc, x + 34, 594, 4, member.muted ? RGB(255, 102, 132) : RGB(48, 233, 174));
      drawTextLine(dc, g_tinyFont, RGB(203, 215, 239), member.name,
                   RECT{x - 10, 599, x + 52, 623}, DT_CENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
    } else {
      strokeRounded(dc, RECT{x, 558, x + 38, 596}, 38, RGB(92, 111, 153), 2);
      drawTextLine(dc, g_titleFont, RGB(136, 151, 186), L"+", RECT{x, 558, x + 38, 596},
                   DT_CENTER | DT_SINGLELINE | DT_VCENTER);
      drawTextLine(dc, g_tinyFont, RGB(116, 132, 166), L"Libre",
                   RECT{x - 8, 599, x + 46, 623}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    }
  }
  drawButton(dc, RECT{right - 128, 562, right - 78, 612}, g_microphoneMuted ? L"M" : L"Mic",
             g_microphoneMuted, RGB(78, 90, 242));
  drawButton(dc, RECT{right - 68, 562, right - 18, 612}, g_deafened ? L"X" : L"Son",
             g_deafened, RGB(78, 90, 242));

  RECT footer{left, 652, right, 688};
  fillRounded(dc, footer, 12, RGB(8, 20, 42));
  strokeRounded(dc, footer, 12, RGB(43, 61, 104));
  drawButton(dc, RECT{left + 10, 657, left + 62, 683}, L"Ctrl");
  drawTextLine(dc, g_bodyFont, RGB(143, 162, 199), L"+",
               RECT{left + 66, 657, left + 84, 683}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
  drawButton(dc, RECT{left + 88, 657, left + 122, 683}, L"G");
  drawTextLine(dc, g_smallFont, RGB(179, 195, 225), L"Ouvrir / fermer GameMate",
               RECT{left + 136, 652, right - 16, 688});
}

void paintMessages(HDC dc) {
  RECT listPanel{kSidebarWidth, kHeaderHeight, 388, kPanelHeight};
  fillRectColor(dc, listPanel, RGB(13, 22, 43));
  RECT search{112, 88, 368, 126};
  fillRounded(dc, search, 14, RGB(23, 34, 61));
  drawTextLine(dc, g_smallFont, RGB(120, 136, 168), L"Rechercher une conversation…",
               RECT{128, 88, 356, 126});

  for (size_t i = 0; i < g_conversations.size(); ++i) {
    const int y = 140 + static_cast<int>(i) * 92;
    RECT row{104, y, 378, y + 82};
    if (static_cast<int>(i) == g_selectedConversation)
      fillRounded(dc, row, 16, RGB(28, 44, 77));
    const Conversation& conversation = g_conversations[i];
    drawAvatar(dc, 118, y + 15, 48, conversation.accent, conversation.name);
    drawDot(dc, 160, y + 57, 5,
            conversation.online ? RGB(70, 226, 150) : RGB(100, 111, 137));
    RECT name{178, y + 9, 314, y + 36};
    drawTextLine(dc, g_bodyFont, RGB(235, 240, 252), conversation.name, name);
    RECT time{310, y + 10, 366, y + 34};
    drawTextLine(dc, g_tinyFont, RGB(113, 127, 158), conversation.time, time,
                 DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
    RECT preview{178, y + 38, 346, y + 66};
    drawTextLine(dc, g_smallFont, RGB(136, 151, 183), conversation.preview, preview);
    if (conversation.unread > 0) {
      RECT badge{344, y + 48, 368, y + 72};
      fillRounded(dc, badge, 24, RGB(55, 205, 255));
      drawTextLine(dc, g_tinyFont, RGB(5, 16, 31), std::to_wstring(conversation.unread), badge,
                   DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    }
  }

  if (g_conversations.empty()) {
    RECT empty{418, 166, 1008, 548};
    fillRounded(dc, empty, 22, RGB(7, 21, 39));
    drawTextLine(dc, g_titleFont, RGB(238, 243, 253), L"Aucune conversation synchronisée",
                 RECT{454, 246, 972, 294}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    drawTextLine(dc, g_smallFont, RGB(125, 143, 173),
                 L"Ouvre Companion et connecte ton compte. Tes véritables conversations apparaîtront ici.",
                 RECT{494, 302, 932, 368}, DT_CENTER | DT_WORDBREAK);
    drawButton(dc, RECT{620, 402, 806, 450}, L"Ouvrir Companion", true);
    return;
  }

  const Conversation& selected = g_conversations[static_cast<size_t>(g_selectedConversation)];
  RECT conversationHeader{388, kHeaderHeight, kPanelWidth, 142};
  fillRectColor(dc, conversationHeader, RGB(15, 25, 48));
  drawAvatar(dc, 410, 85, 44, selected.accent, selected.name);
  RECT selectedName{468, 79, 720, 109};
  drawTextLine(dc, g_bodyFont, RGB(241, 246, 255), selected.name, selectedName);
  RECT selectedActivity{468, 106, 760, 132};
  drawTextLine(dc, g_smallFont, RGB(122, 229, 173), selected.activity, selectedActivity);
  drawButton(dc, RECT{850, 88, 913, 128}, L"Vocal");
  drawButton(dc, RECT{925, 88, 1015, 128}, L"Profil");

  int messageY = 170;
  for (const ChatLine& line : selected.messages) {
    const int bubbleWidth = 410;
    const int left = line.mine ? 600 : 418;
    RECT bubble{left, messageY, left + bubbleWidth, messageY + 72};
    if (bubble.right > 1016) {
      const int overflow = bubble.right - 1016;
      bubble.left -= overflow;
      bubble.right -= overflow;
    }
    fillRounded(dc, bubble, 16, line.mine ? RGB(37, 79, 113) : RGB(28, 41, 70));
    RECT author{bubble.left + 14, bubble.top + 7, bubble.right - 70, bubble.top + 30};
    drawTextLine(dc, g_tinyFont, line.mine ? RGB(102, 221, 255) : selected.accent,
                 line.author, author);
    RECT time{bubble.right - 70, bubble.top + 7, bubble.right - 12, bubble.top + 30};
    drawTextLine(dc, g_tinyFont, RGB(122, 137, 168), line.time, time,
                 DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
    RECT content{bubble.left + 14, bubble.top + 30, bubble.right - 14, bubble.bottom - 8};
    drawTextLine(dc, g_smallFont, RGB(228, 235, 249), line.text, content);
    messageY += 88;
  }

  RECT composer{410, 574, 1018, 626};
  fillRounded(dc, composer, 17, RGB(22, 35, 62));
  drawTextLine(dc, g_smallFont, RGB(121, 137, 170),
               L"Répondre depuis Companion — saisie directe bientôt disponible",
               RECT{428, 574, 835, 626});
  drawButton(dc, RECT{860, 582, 1005, 618}, L"Ouvrir Companion", true);
}

void paintFriends(HDC dc) {
  const int onlineCount = static_cast<int>(std::count_if(
      g_friends.begin(), g_friends.end(), [](const FriendInfo& item) { return item.online; }));
  drawButton(dc, RECT{118, 88, 236, 128},
             L"Tous (" + std::to_wstring(g_friends.size()) + L")", !g_onlineFriendsOnly);
  drawButton(dc, RECT{248, 88, 380, 128},
             L"En ligne (" + std::to_wstring(onlineCount) + L")", g_onlineFriendsOnly);
  RECT add{842, 88, 1012, 128};
  drawButton(dc, add, L"+ Ajouter un ami", true, RGB(73, 224, 159));

  if (g_friends.empty()) {
    RECT empty{120, 160, 1012, 560};
    fillRounded(dc, empty, 22, RGB(7, 21, 39));
    drawTextLine(dc, g_titleFont, RGB(238, 243, 253), L"Aucun ami synchronisé",
                 RECT{180, 258, 952, 310}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    drawTextLine(dc, g_smallFont, RGB(125, 143, 173),
                 L"La liste affichera uniquement les véritables amis de ton compte Companion.",
                 RECT{250, 320, 882, 378}, DT_CENTER | DT_WORDBREAK);
    return;
  }

  int displayedRow = 0;
  for (size_t i = 0; i < g_friends.size(); ++i) {
    if (g_onlineFriendsOnly && !g_friends[i].online) continue;
    const int y = 150 + displayedRow * 88;
    RECT row{116, y, 1014, y + 76};
    fillRounded(dc, row, 15, displayedRow % 2 == 0 ? RGB(18, 29, 53) : RGB(15, 25, 47));
    const FriendInfo& friendInfo = g_friends[i];
    drawAvatar(dc, 132, y + 13, 50, friendInfo.accent, friendInfo.name);
    drawDot(dc, 176, y + 59, 5,
            friendInfo.online ? RGB(70, 226, 150) : RGB(100, 111, 137));
    RECT name{198, y + 9, 430, y + 38};
    drawTextLine(dc, g_bodyFont, RGB(237, 243, 255), friendInfo.name, name);
    RECT activity{198, y + 37, 480, y + 66};
    drawTextLine(dc, g_smallFont,
                 friendInfo.online ? RGB(105, 218, 255) : RGB(121, 134, 163),
                 friendInfo.activity, activity);
    RECT status{560, y + 18, 760, y + 58};
    drawTextLine(dc, g_smallFont, RGB(152, 166, 194), friendInfo.status, status);
    drawButton(dc, RECT{820, y + 18, 913, y + 58}, L"Message");
    drawButton(dc, RECT{925, y + 18, 997, y + 58}, L"Inviter");
    ++displayedRow;
  }
  if (displayedRow == 0) {
    drawTextLine(dc, g_bodyFont, RGB(181, 195, 222), L"Aucun ami en ligne",
                 RECT{220, 270, 920, 330}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
  }
}

int friendIndexForDisplayedRow(int requestedRow) {
  int displayedRow = 0;
  for (size_t i = 0; i < g_friends.size(); ++i) {
    if (g_onlineFriendsOnly && !g_friends[i].online) continue;
    if (displayedRow == requestedRow) return static_cast<int>(i);
    ++displayedRow;
  }
  return -1;
}

void paintSquad(HDC dc) {
  RECT room{118, 92, 1014, 154};
  fillRounded(dc, room, 18, RGB(20, 36, 63));
  drawDot(dc, 146, 123, 8, g_inSquad ? RGB(76, 231, 155) : RGB(120, 130, 155));
  drawTextLine(dc, g_bodyFont, RGB(238, 244, 255),
               g_inSquad ? L"Salon vocal connecté" : L"Aucun vocal connecté",
               RECT{168, 94, 650, 132});
  drawTextLine(dc, g_tinyFont, RGB(134, 150, 181), L"Synchronisation avec Companion",
               RECT{168, 126, 650, 150});
  drawButton(dc, RECT{838, 103, 995, 143}, g_inSquad ? L"Quitter le vocal" : L"Rejoindre", g_inSquad);

  drawTextLine(dc, g_smallFont, RGB(128, 144, 176), L"MEMBRES DU VOCAL",
               RECT{122, 174, 430, 206});
  RECT emptyMembers{120, 214, 688, 500};
  fillRounded(dc, emptyMembers, 18, RGB(7, 21, 39));
  drawTextLine(dc, g_bodyFont, RGB(230, 237, 250), L"Aucun membre synchronisé",
               RECT{164, 292, 644, 336}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
  drawTextLine(dc, g_smallFont, RGB(125, 142, 173),
               L"Rejoins une squad depuis Companion pour afficher le véritable salon vocal.",
               RECT{174, 344, 634, 404}, DT_CENTER | DT_WORDBREAK);

  RECT controls{716, 180, 1014, 518};
  fillRounded(dc, controls, 18, RGB(17, 28, 51));
  drawTextLine(dc, g_bodyFont, RGB(237, 243, 255), L"Contrôles rapides",
               RECT{740, 198, 980, 236});
  drawButton(dc, RECT{740, 250, 990, 302},
             g_microphoneMuted ? L"Micro coupé" : L"Micro actif", g_microphoneMuted,
             RGB(255, 95, 126));
  drawButton(dc, RECT{740, 318, 990, 370},
             g_deafened ? L"Son désactivé" : L"Son actif", g_deafened,
             RGB(255, 95, 126));
  drawButton(dc, RECT{740, 386, 990, 438}, L"Réglages audio");
  drawTextLine(dc, g_tinyFont, RGB(118, 135, 167),
               L"Les changements seront synchronisés avec Companion.",
               RECT{740, 456, 990, 496}, DT_CENTER | DT_WORDBREAK);
}

void paintProfile(HDC dc) {
  RECT banner{116, 94, 1016, 248};
  fillRounded(dc, banner, 22, RGB(29, 49, 84));
  RECT accent{116, 94, 1016, 102};
  fillRounded(dc, accent, 8, RGB(49, 207, 255));
  const std::wstring displayName = g_profileName.empty() ? L"Profil non connecté" : g_profileName;
  drawAvatar(dc, 150, 136, 86, RGB(130, 76, 255), displayName);
  drawTextLine(dc, g_titleFont, RGB(245, 248, 255), displayName,
               RECT{258, 126, 540, 168});
  const std::wstring profileState = g_profileStatus.empty() ?
      L"● En attente de Companion" : L"● " + g_profileStatus;
  drawTextLine(dc, g_smallFont, RGB(104, 226, 169), profileState,
               RECT{258, 167, 620, 198});
  drawTextLine(dc, g_smallFont, RGB(149, 164, 194), L"Données synchronisées depuis ton compte",
               RECT{258, 198, 620, 226});
  drawButton(dc, RECT{824, 144, 988, 190}, L"Modifier le profil", true);

  const std::array<std::wstring, 3> values = {g_profileLevel, g_profileRank, g_profilePlaytime};
  const std::array<std::wstring, 3> labels = {L"NIVEAU", L"RANG ACTUEL", L"TEMPS DE JEU"};
  for (int i = 0; i < 3; ++i) {
    const int x = 120 + i * 300;
    RECT card{x, 276, x + 276, 390};
    fillRounded(dc, card, 18, RGB(18, 30, 54));
    drawTextLine(dc, g_titleFont, RGB(239, 245, 255), values[static_cast<size_t>(i)],
                 RECT{x + 20, 292, x + 256, 338}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    drawTextLine(dc, g_tinyFont, RGB(125, 141, 173), labels[static_cast<size_t>(i)],
                 RECT{x + 20, 340, x + 256, 374}, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
  }

  RECT completion{120, 424, 1012, 590};
  fillRounded(dc, completion, 18, RGB(18, 30, 54));
  drawTextLine(dc, g_bodyFont, RGB(237, 243, 255), L"Complétion du profil",
               RECT{144, 440, 500, 478});
  drawTextLine(dc, g_bodyFont, RGB(73, 215, 255), std::to_wstring(g_profileCompletion) + L" %",
               RECT{880, 440, 980, 478}, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
  RECT bar{144, 492, 984, 510};
  fillRounded(dc, bar, 16, RGB(35, 48, 76));
  RECT progress = bar;
  progress.right = progress.left + (bar.right - bar.left) * g_profileCompletion / 100;
  fillRounded(dc, progress, 16, RGB(48, 205, 255));
  drawTextLine(dc, g_smallFont, RGB(142, 157, 187),
               L"Ajoute tes disponibilités, ton rôle préféré et deux jeux pour atteindre 100 %.",
               RECT{144, 526, 810, 570});
  drawButton(dc, RECT{824, 528, 984, 572}, L"Compléter", true);
}

void paintAudio(HDC dc) {
  drawTextLine(dc, g_smallFont, RGB(129, 145, 177), L"PÉRIPHÉRIQUES",
               RECT{122, 92, 430, 124});
  RECT input{120, 130, 1014, 210};
  RECT output{120, 226, 1014, 306};
  fillRounded(dc, input, 18, RGB(18, 30, 54));
  fillRounded(dc, output, 18, RGB(18, 30, 54));
  drawTextLine(dc, g_smallFont, RGB(126, 142, 174), L"MICROPHONE (CLIQUER POUR CHANGER)",
               RECT{144, 140, 550, 166});
  drawTextLine(dc, g_bodyFont, RGB(239, 244, 255),
               g_inputOverride.empty() ? g_inputDevices[static_cast<size_t>(g_inputDevice)] :
                                         g_inputOverride,
               RECT{144, 166, 680, 202});
  drawButton(dc, RECT{782, 150, 942, 192},
             g_testingMicrophone ? L"Arrêter le test" : L"Tester le micro",
             g_testingMicrophone, RGB(21, 190, 137));
  drawDot(dc, 972, 170, 8, RGB(73, 226, 157));
  drawTextLine(dc, g_smallFont, RGB(126, 142, 174), L"SORTIE AUDIO (CLIQUER POUR CHANGER)",
               RECT{144, 236, 550, 262});
  drawTextLine(dc, g_bodyFont, RGB(239, 244, 255),
               g_outputOverride.empty() ? g_outputDevices[static_cast<size_t>(g_outputDevice)] :
                                          g_outputOverride,
               RECT{144, 262, 680, 298});
  drawDot(dc, 966, 266, 8, RGB(73, 226, 157));

  drawTextLine(dc, g_smallFont, RGB(129, 145, 177), L"NIVEAUX",
               RECT{122, 330, 430, 362});
  RECT levels{120, 368, 1014, 510};
  fillRounded(dc, levels, 18, RGB(18, 30, 54));
  drawTextLine(dc, g_smallFont, RGB(219, 228, 245), L"Volume du microphone",
               RECT{146, 382, 420, 414});
  drawTextLine(dc, g_smallFont, RGB(219, 228, 245), L"Volume de sortie",
               RECT{146, 444, 420, 476});
  const std::array<int, 2> volumes = {g_inputVolume, g_outputVolume};
  for (int i = 0; i < 2; ++i) {
    const int y = 396 + i * 62;
    RECT bar{438, y, 874, y + 14};
    fillRounded(dc, bar, 12, RGB(37, 51, 80));
    RECT active = bar;
    active.right = active.left + (bar.right - bar.left) * volumes[static_cast<size_t>(i)] / 100;
    fillRounded(dc, active, 12, RGB(48, 205, 255));
    drawDot(dc, active.right, y + 7, 9, RGB(225, 247, 255));
    RECT value{900, y - 10, 980, y + 28};
    drawTextLine(dc, g_bodyFont, RGB(77, 217, 255),
                 std::to_wstring(volumes[static_cast<size_t>(i)]) + L" %", value,
                 DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
  }
  RECT appearance{120, 536, 1014, 614};
  fillRounded(dc, appearance, 18, RGB(18, 30, 54));
  drawTextLine(dc, g_smallFont, RGB(219, 228, 245), L"Affichage",
               RECT{146, 548, 272, 600});
  drawTextLine(dc, g_smallFont, RGB(224, 246, 255), L"Opaque à 100 %",
               RECT{300, 548, 520, 600});
  drawTextLine(dc, g_tinyFont, RGB(104, 121, 154),
               L"La transparence est désactivée.",
               RECT{520, 548, 780, 600}, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
  drawButton(dc, RECT{802, 550, 990, 600}, L"Recentrer l'overlay");
}

void paintOverlay(HWND window) {
  PAINTSTRUCT paint{};
  HDC target = BeginPaint(window, &paint);
  RECT client{};
  GetClientRect(window, &client);
  HDC dc = CreateCompatibleDC(target);
  HBITMAP bitmap = CreateCompatibleBitmap(target, client.right - client.left,
                                          client.bottom - client.top);
  HBITMAP previousBitmap = static_cast<HBITMAP>(SelectObject(dc, bitmap));
  fillRectColor(dc, client, RGB(4, 18, 42));
  paintSidebar(dc);
  paintHeader(dc);
  switch (g_page) {
    case Page::Home: paintHome(dc); break;
    case Page::Friends: paintFriends(dc); break;
    case Page::Messages: paintMessages(dc); break;
    case Page::Squad: paintSquad(dc); break;
    case Page::Profile: paintProfile(dc); break;
    case Page::Audio: paintAudio(dc); break;
  }
  RECT glowOuter{1, 1, client.right - 1, client.bottom - 1};
  RECT glowInner{3, 3, client.right - 3, client.bottom - 3};
  strokeRounded(dc, glowOuter, 28, RGB(126, 68, 255), 2);
  strokeRounded(dc, glowInner, 26, RGB(44, 171, 255));
  BitBlt(target, 0, 0, client.right - client.left, client.bottom - client.top,
         dc, 0, 0, SRCCOPY);
  SelectObject(dc, previousBitmap);
  DeleteObject(bitmap);
  DeleteDC(dc);
  EndPaint(window, &paint);
}

void openFriendConversation(const FriendInfo& friendInfo) {
  if (friendInfo.conversationIndex >= 0) {
    g_selectedConversation = friendInfo.conversationIndex;
  } else {
    return;
  }
  if (g_selectedConversation < 0 ||
      g_selectedConversation >= static_cast<int>(g_conversations.size())) return;
  g_conversations[static_cast<size_t>(g_selectedConversation)].unread = 0;
  switchPage(Page::Messages);
}

void handleClick(int x, int y) {
  const int panelWidth = currentPanelWidth();
  if (x >= panelWidth - 48 && y <= 68) {
    hideOverlay();
    return;
  }
  if (x >= panelWidth - 92 && x < panelWidth - 48 && y <= 68) {
    switchPage(Page::Audio);
    return;
  }
  if (x < kSidebarWidth && y >= 84 && y < 84 + 6 * 78) {
    const int index = (y - 84) / 78;
    switchPage(static_cast<Page>(std::clamp(index, 0, 5)));
    return;
  }

  if (g_page == Page::Home) {
    if (y >= 84 && y < 316) {
      switchPage(Page::Friends);
      return;
    }
    if (y >= 326 && y < 500) {
      if (y >= 370 && !g_conversations.empty()) {
        const int index = std::clamp((y - 370) / 58, 0,
                                     static_cast<int>(g_conversations.size()) - 1);
        g_selectedConversation = index;
        g_conversations[static_cast<size_t>(index)].unread = 0;
      }
      switchPage(Page::Messages);
      return;
    }
    if (inside(x, y, RECT{kHomeWidth - 144, 562, kHomeWidth - 94, 612})) {
      g_microphoneMuted = !g_microphoneMuted;
      writeIniNumber(L"audio", L"microphone_muted", g_microphoneMuted ? 1 : 0);
    } else if (inside(x, y, RECT{kHomeWidth - 84, 562, kHomeWidth - 34, 612})) {
      g_deafened = !g_deafened;
      writeIniNumber(L"audio", L"deafened", g_deafened ? 1 : 0);
    } else if (y >= 510 && y < 642) {
      switchPage(Page::Squad);
      return;
    } else if (y >= 652 && y < 688) {
      hideOverlay();
      return;
    }
  } else if (g_page == Page::Messages) {
    if (g_conversations.empty() && inside(x, y, RECT{620, 402, 806, 450})) {
      requestCompanionAction(L"messages");
    } else if (inside(x, y, RECT{860, 574, 1018, 626})) {
      requestCompanionAction(L"messages");
    } else if (inside(x, y, RECT{850, 88, 913, 128})) {
      switchPage(Page::Squad);
    } else if (inside(x, y, RECT{925, 88, 1015, 128})) {
      switchPage(Page::Profile);
    } else if (x >= 104 && x < 378 && y >= 140) {
      const int index = (y - 140) / 92;
      if (index >= 0 && index < static_cast<int>(g_conversations.size())) {
        g_selectedConversation = index;
        g_conversations[static_cast<size_t>(index)].unread = 0;
      }
    }
  } else if (g_page == Page::Friends) {
    if (inside(x, y, RECT{118, 88, 236, 128})) {
      g_onlineFriendsOnly = false;
    } else if (inside(x, y, RECT{248, 88, 380, 128})) {
      g_onlineFriendsOnly = true;
    } else if (inside(x, y, RECT{842, 88, 1012, 128})) {
      requestCompanionAction(L"add_friend");
    } else if (y >= 150) {
      const int displayedRow = (y - 150) / 88;
      const int index = friendIndexForDisplayedRow(displayedRow);
      if (index >= 0) {
        if (inside(x, y, RECT{925, 150 + displayedRow * 88 + 18,
                              997, 150 + displayedRow * 88 + 58})) {
          g_inSquad = true;
          writeIniNumber(L"squad", L"connected", 1);
          switchPage(Page::Squad);
        } else if (g_friends[static_cast<size_t>(index)].conversationIndex < 0) {
          requestCompanionAction(L"message_friend");
        } else {
          openFriendConversation(g_friends[static_cast<size_t>(index)]);
        }
      }
    }
  } else if (g_page == Page::Squad) {
    if (inside(x, y, RECT{838, 103, 995, 143})) {
      g_inSquad = !g_inSquad;
      writeIniNumber(L"squad", L"connected", g_inSquad ? 1 : 0);
    } else if (inside(x, y, RECT{740, 250, 990, 302})) {
      g_microphoneMuted = !g_microphoneMuted;
      writeIniNumber(L"audio", L"microphone_muted", g_microphoneMuted ? 1 : 0);
    } else if (inside(x, y, RECT{740, 318, 990, 370})) {
      g_deafened = !g_deafened;
      writeIniNumber(L"audio", L"deafened", g_deafened ? 1 : 0);
    } else if (inside(x, y, RECT{740, 386, 990, 438})) {
      switchPage(Page::Audio);
    }
  } else if (g_page == Page::Profile) {
    if (inside(x, y, RECT{824, 144, 988, 190}) ||
        inside(x, y, RECT{824, 528, 984, 572})) {
      requestCompanionAction(L"profile");
    }
  } else if (g_page == Page::Audio) {
    if (inside(x, y, RECT{782, 150, 942, 192})) {
      g_testingMicrophone = !g_testingMicrophone;
    } else if (inside(x, y, RECT{120, 130, 1014, 210})) {
      g_inputDevice = (g_inputDevice + 1) % static_cast<int>(g_inputDevices.size());
      g_inputOverride = g_inputDevices[static_cast<size_t>(g_inputDevice)];
      writeAudioState(L"input", g_inputOverride);
    } else if (inside(x, y, RECT{120, 226, 1014, 306})) {
      g_outputDevice = (g_outputDevice + 1) % static_cast<int>(g_outputDevices.size());
      g_outputOverride = g_outputDevices[static_cast<size_t>(g_outputDevice)];
      writeAudioState(L"output", g_outputOverride);
    } else if (inside(x, y, RECT{438, 378, 874, 430})) {
      g_inputVolume = std::clamp((x - 438) * 100 / (874 - 438), 0, 100);
      writeIniNumber(L"audio", L"input_volume", g_inputVolume);
    } else if (inside(x, y, RECT{438, 440, 874, 492})) {
      g_outputVolume = std::clamp((x - 438) * 100 / (874 - 438), 0, 100);
      writeIniNumber(L"audio", L"output_volume", g_outputVolume);
    } else if (inside(x, y, RECT{802, 550, 990, 600})) {
      g_userPositioned = false;
      writeIniNumber(L"overlay", L"has_position", 0);
      positionOverlay();
    }
  }
  InvalidateRect(g_overlay, nullptr, FALSE);
}

LRESULT CALLBACK windowProcedure(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
    case WM_HOTKEY:
      if (wParam == kHotkeyId) {
        if (g_visible) hideOverlay();
        else showForForegroundWindow();
      } else if (wParam == kCloseHotkeyId && g_visible) {
        hideOverlay();
      }
      return 0;
    case WM_TIMER:
      if (wParam == kTimerId && g_visible) {
        if (!IsWindow(g_target) || IsIconic(g_target)) hideOverlay();
        else {
          const bool stateChanged = loadCompanionState();
          const bool modeChanged = updateTargetMode();
          if (stateChanged || modeChanged) InvalidateRect(window, nullptr, FALSE);
        }
      }
      return 0;
    case WM_ERASEBKGND: {
      RECT client{};
      GetClientRect(window, &client);
      HBRUSH background = CreateSolidBrush(RGB(4, 18, 42));
      FillRect(reinterpret_cast<HDC>(wParam), &client, background);
      DeleteObject(background);
      return 1;
    }
    case WM_PAINT:
      paintOverlay(window);
      return 0;
    case WM_MOUSEACTIVATE:
      return MA_NOACTIVATE;
    case WM_SETCURSOR: {
      POINT cursor{};
      GetCursorPos(&cursor);
      ScreenToClient(window, &cursor);
      const bool moveArea = cursor.y < kHeaderHeight && cursor.x >= kSidebarWidth &&
                            cursor.x < currentPanelWidth() - 250;
      SetCursor(LoadCursorW(nullptr, moveArea ? IDC_SIZEALL : IDC_HAND));
      return TRUE;
    }
    case WM_LBUTTONDOWN: {
      const int x = GET_X_LPARAM(lParam);
      const int y = GET_Y_LPARAM(lParam);
      if (y < kHeaderHeight && x >= kSidebarWidth && x < currentPanelWidth() - 250) {
        g_dragging = true;
        GetCursorPos(&g_dragStartCursor);
        GetWindowRect(window, &g_dragStartWindow);
        SetCapture(window);
      }
      return 0;
    }
    case WM_MOUSEMOVE:
      if (g_dragging && (wParam & MK_LBUTTON)) {
        POINT cursor{};
        GetCursorPos(&cursor);
        g_savedX = g_dragStartWindow.left + cursor.x - g_dragStartCursor.x;
        g_savedY = g_dragStartWindow.top + cursor.y - g_dragStartCursor.y;
        g_userPositioned = true;
        SetWindowPos(window, nullptr, g_savedX, g_savedY, 0, 0,
                     SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER);
      }
      return 0;
    case WM_LBUTTONUP:
      if (g_dragging) {
        g_dragging = false;
        ReleaseCapture();
        writeIniNumber(L"overlay", L"x", g_savedX);
        writeIniNumber(L"overlay", L"y", g_savedY);
        writeIniNumber(L"overlay", L"has_position", 1);
        return 0;
      }
      handleClick(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
      return 0;
    case WM_CAPTURECHANGED:
      g_dragging = false;
      return 0;
    case kTrayMessage:
      if (lParam == WM_RBUTTONUP || lParam == WM_CONTEXTMENU) showTrayMenu(window);
      else if (lParam == WM_LBUTTONDBLCLK) {
        if (g_visible) hideOverlay();
        else showForForegroundWindow();
      }
      return 0;
    case WM_COMMAND:
      if (LOWORD(wParam) == kExitCommand) DestroyWindow(window);
      return 0;
    case WM_CLOSE:
      hideOverlay();
      return 0;
    case WM_DESTROY:
      KillTimer(window, kTimerId);
      UnregisterHotKey(window, kHotkeyId);
      UnregisterHotKey(window, kCloseHotkeyId);
      removeTrayIcon(window);
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(window, message, wParam, lParam);
}
}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
  if (auto setDpi = reinterpret_cast<BOOL(WINAPI*)(DPI_AWARENESS_CONTEXT)>(
          GetProcAddress(GetModuleHandleW(L"user32.dll"), "SetProcessDpiAwarenessContext")))
    setDpi(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  HANDLE singleInstance = CreateMutexW(nullptr, TRUE, L"GameMateExternalOverlayV16_5.Singleton");
  if (!singleInstance || GetLastError() == ERROR_ALREADY_EXISTS) {
    MessageBoxW(nullptr, L"Game Mate Overlay V16.5 est déjà lancé près de l'horloge.",
                kWindowTitle, MB_OK | MB_ICONINFORMATION);
    if (singleInstance) CloseHandle(singleInstance);
    return 0;
  }

  WNDCLASSEXW windowClass{sizeof(WNDCLASSEXW)};
  windowClass.hInstance = instance;
  windowClass.lpfnWndProc = windowProcedure;
  windowClass.lpszClassName = kWindowClass;
  windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  windowClass.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
  g_backgroundBrush = CreateSolidBrush(RGB(4, 18, 42));
  windowClass.hbrBackground = g_backgroundBrush;
  if (!RegisterClassExW(&windowClass)) {
    CloseHandle(singleInstance);
    return 1;
  }

  g_overlay = CreateWindowExW(
      WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
      kWindowClass, kWindowTitle, WS_POPUP, 0, 0, kHomeWidth, kHomeHeight,
      nullptr, nullptr, instance, nullptr);
  if (!g_overlay) {
    CloseHandle(singleInstance);
    return 2;
  }

  applyWindowShape();
  g_logoFont = CreateFontW(-18, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
                            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                            CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  g_titleFont = CreateFontW(-24, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
                            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                            CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  g_bodyFont = CreateFontW(-19, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE,
                           DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                           CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  g_smallFont = CreateFontW(-15, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                            CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  g_tinyFont = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                           DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                           CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");

  if (!RegisterHotKey(g_overlay, kHotkeyId, MOD_CONTROL | MOD_NOREPEAT, 'G')) {
    MessageBoxW(nullptr,
                L"Ctrl+G est déjà utilisé. Ferme l'ancien overlay Game Mate puis relance la V16.5.",
                kWindowTitle, MB_OK | MB_ICONERROR);
    DestroyWindow(g_overlay);
    DeleteObject(g_logoFont);
    DeleteObject(g_titleFont);
    DeleteObject(g_bodyFont);
    DeleteObject(g_smallFont);
    DeleteObject(g_tinyFont);
  if (g_backgroundBrush) DeleteObject(g_backgroundBrush);
    CloseHandle(singleInstance);
    return 3;
  }

  const HRESULT audioComResult = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  refreshAudioDevices();
  loadCompanionState(true);
  SetTimer(g_overlay, kTimerId, 500, nullptr);
  addTrayIcon(g_overlay);
  MSG message{};
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }

  DeleteObject(g_logoFont);
  DeleteObject(g_titleFont);
  DeleteObject(g_bodyFont);
  DeleteObject(g_smallFont);
  DeleteObject(g_tinyFont);
  if (SUCCEEDED(audioComResult)) CoUninitialize();
  CloseHandle(singleInstance);
  return static_cast<int>(message.wParam);
}

#include "TomCat/Core/Input.h"

#include <GLFW/glfw3.h>

namespace TomCat {

namespace {

GLFWwindow* CurrentWindow()
{
	// Emscripten's GLFW backend keeps the browser canvas as the current GLFW
	// context.  Using glfwGetCurrentContext avoids coupling this adapter to the
	// runtime's private window handle and also makes it safe for an embedded
	// editor instance.
	return glfwGetCurrentContext();
}

} // namespace

bool Input::IsKeyPressed(KeyCode keyCode)
{
	GLFWwindow* window = CurrentWindow();
	if (!window)
		return false;
	const int state = glfwGetKey(window, static_cast<int>(keyCode));
	return state == GLFW_PRESS || state == GLFW_REPEAT;
}

bool Input::IsMouseButtonPressed(MouseCode button)
{
	GLFWwindow* window = CurrentWindow();
	if (!window)
		return false;
	return glfwGetMouseButton(window, static_cast<int>(button)) == GLFW_PRESS;
}

std::pair<float, float> Input::GetMousePositon()
{
	GLFWwindow* window = CurrentWindow();
	if (!window)
		return { 0.0f, 0.0f };
	double x = 0.0, y = 0.0;
	glfwGetCursorPos(window, &x, &y);
	return { static_cast<float>(x), static_cast<float>(y) };
}

float Input::GetMouseX()
{
	return GetMousePositon().first;
}

float Input::GetMouseY()
{
	return GetMousePositon().second;
}

} // namespace TomCat

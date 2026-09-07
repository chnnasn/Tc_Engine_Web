#include "TomCat/Renderer/Framebuffer.h"
#include "TomCat/Renderer/Renderer.h"
#include "TomCat/Core/Log.h"

#include <GLES3/gl3.h>

#include <algorithm>
#include <vector>

namespace TomCat {

namespace {

constexpr uint32_t kMaxFramebufferSize = 8192;

bool IsDepthFormat(FramebufferTextureFormat format)
{
	return format == FramebufferTextureFormat::DEPTH24STENCIL8;
}

GLenum ColorInternalFormat(FramebufferTextureFormat format)
{
	switch (format)
	{
	case FramebufferTextureFormat::RGBA8: return GL_RGBA8;
	// WebGL2 implementations differ on mixed normalized/integer MRTs.  The
	// upstream editor's Web shader intentionally omits the desktop picking
	// output, so keep this attachment normalized and portable instead of
	// making the whole scene framebuffer incomplete on stricter browsers.
	case FramebufferTextureFormat::RED_INTEGER: return GL_RGBA8;
	default: return GL_RGBA8;
	}
}

GLenum ColorFormat(FramebufferTextureFormat format)
{
	return GL_RGBA;
}

GLenum ColorType(FramebufferTextureFormat format)
{
	return GL_UNSIGNED_BYTE;
}

} // namespace

/**
 * GLES3 framebuffer implementation used by the Web editor.  The desktop
 * OpenGL implementation relies on 4.5 direct-state-access entry points
 * (glCreateFramebuffers/glClearTexImage), which are not part of WebGL2.  This
 * class keeps the exact Framebuffer interface and uses the core GLES3 calls
 * available in Emscripten's WebGL2 context.
 */
class WebFramebuffer final : public Framebuffer
{
public:
	explicit WebFramebuffer(const FramebufferSpecification& specification)
		: m_Specification(specification)
	{
		for (const auto& attachment : m_Specification.Attachments.Attachments)
		{
			if (IsDepthFormat(attachment.TextureFormat))
				m_DepthAttachmentSpecification = attachment;
			else if (attachment.TextureFormat != FramebufferTextureFormat::RED_INTEGER)
				// The desktop editor uses a second integer MRT for picking.  The
				// WebGL shader path intentionally has no integer output; omitting
				// that physical attachment keeps the scene FBO complete on browsers
				// that reject multiple color attachments with mixed formats.
				m_ColorAttachmentSpecifications.push_back(attachment);
		}
		Invalidate();
	}

	~WebFramebuffer() override
	{
		if (!m_ColorAttachments.empty())
			glDeleteTextures((GLsizei)m_ColorAttachments.size(), m_ColorAttachments.data());
		if (m_DepthAttachment)
			glDeleteRenderbuffers(1, &m_DepthAttachment);
		if (m_RendererID)
			glDeleteFramebuffers(1, &m_RendererID);
	}

	void Invalidate()
	{
		if (m_RendererID)
		{
			glDeleteFramebuffers(1, &m_RendererID);
			m_RendererID = 0;
		}
		if (!m_ColorAttachments.empty())
		{
			glDeleteTextures((GLsizei)m_ColorAttachments.size(), m_ColorAttachments.data());
			m_ColorAttachments.clear();
		}
		if (m_DepthAttachment)
		{
			glDeleteRenderbuffers(1, &m_DepthAttachment);
			m_DepthAttachment = 0;
		}

		m_Specification.Width = std::clamp(m_Specification.Width, 1u, kMaxFramebufferSize);
		m_Specification.Height = std::clamp(m_Specification.Height, 1u, kMaxFramebufferSize);

		glGenFramebuffers(1, &m_RendererID);
		glBindFramebuffer(GL_FRAMEBUFFER, m_RendererID);

		if (!m_ColorAttachmentSpecifications.empty())
		{
			m_ColorAttachments.resize(m_ColorAttachmentSpecifications.size());
			glGenTextures((GLsizei)m_ColorAttachments.size(), m_ColorAttachments.data());
			for (size_t index = 0; index < m_ColorAttachments.size(); ++index)
			{
				const auto format = m_ColorAttachmentSpecifications[index].TextureFormat;
				glBindTexture(GL_TEXTURE_2D, m_ColorAttachments[index]);
				glTexImage2D(GL_TEXTURE_2D, 0, (GLint)ColorInternalFormat(format),
					(GLsizei)m_Specification.Width, (GLsizei)m_Specification.Height, 0,
					ColorFormat(format), ColorType(format), nullptr);
				const GLint filter = format == FramebufferTextureFormat::RED_INTEGER ? GL_NEAREST : GL_LINEAR;
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filter);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filter);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
				glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + (GLenum)index,
					GL_TEXTURE_2D, m_ColorAttachments[index], 0);
			}
		}

		if (m_DepthAttachmentSpecification.TextureFormat != FramebufferTextureFormat::None)
		{
			// A renderbuffer is the broadly renderable WebGL2 path for a
			// combined depth/stencil attachment.  Some browsers reject the
			// texture form even though it is accepted by desktop GL.
			glGenRenderbuffers(1, &m_DepthAttachment);
			glBindRenderbuffer(GL_RENDERBUFFER, m_DepthAttachment);
			glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8,
				(GLsizei)m_Specification.Width, (GLsizei)m_Specification.Height);
			glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT,
				GL_RENDERBUFFER, m_DepthAttachment);
		}

		if (!m_ColorAttachments.empty())
		{
			std::vector<GLenum> drawBuffers;
			drawBuffers.reserve(m_ColorAttachments.size());
			for (size_t index = 0; index < m_ColorAttachments.size(); ++index)
				drawBuffers.push_back(GL_COLOR_ATTACHMENT0 + (GLenum)index);
			glDrawBuffers((GLsizei)drawBuffers.size(), drawBuffers.data());
		}
		else if (m_ColorAttachments.empty())
		{
			glDrawBuffers(0, nullptr);
		}

		const GLenum status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
		if (status != GL_FRAMEBUFFER_COMPLETE)
			TC_Core_Error("Web framebuffer is incomplete (status=0x{0:x})", status);
		glBindTexture(GL_TEXTURE_2D, 0);
		glBindRenderbuffer(GL_RENDERBUFFER, 0);
		glBindFramebuffer(GL_FRAMEBUFFER, 0);
	}

	void Bind() override
	{
		glBindFramebuffer(GL_FRAMEBUFFER, m_RendererID);
		glViewport(0, 0, (GLsizei)m_Specification.Width, (GLsizei)m_Specification.Height);
	}

	void Unbind() override { glBindFramebuffer(GL_FRAMEBUFFER, 0); }

	void Resize(uint32_t width, uint32_t height) override
	{
		if (!width || !height)
			return;
		m_Specification.Width = width;
		m_Specification.Height = height;
		Invalidate();
	}

	int ReadPixel(uint32_t attachmentIndex, int x, int y) override
	{
		if (attachmentIndex >= m_ColorAttachments.size() ||
			m_ColorAttachmentSpecifications[attachmentIndex].TextureFormat != FramebufferTextureFormat::RED_INTEGER)
			return -1;
		// Entity IDs are not emitted by the GLES shader variant (WebGL has no
		// portable mixed integer MRT path).  Returning -1 preserves the
		// upstream "no entity under cursor" contract.
		(void)x;
		(void)y;
		return -1;
	}

	void ClearAttachment(uint32_t attachmentIndex, int value) override
	{
		if (attachmentIndex >= m_ColorAttachments.size())
			return;
		glBindFramebuffer(GL_DRAW_FRAMEBUFFER, m_RendererID);
		const auto format = m_ColorAttachmentSpecifications[attachmentIndex].TextureFormat;
		if (format == FramebufferTextureFormat::RED_INTEGER)
		{
			const GLfloat clearValue[4] = { value < 0 ? 0.0f : static_cast<GLfloat>(value), 0.0f, 0.0f, 0.0f };
			glClearBufferfv(GL_COLOR, (GLint)attachmentIndex, clearValue);
		}
		else
		{
			const GLfloat clearValue[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
			glClearBufferfv(GL_COLOR, (GLint)attachmentIndex, clearValue);
		}
		glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
	}

	uint32_t GetColorAttachmentRendererID(uint32_t index = 0) const override
	{
		return index < m_ColorAttachments.size() ? m_ColorAttachments[index] : 0;
	}

	const FramebufferSpecification& GetSpecification() const override { return m_Specification; }

private:
	uint32_t m_RendererID = 0;
	FramebufferSpecification m_Specification{};
	std::vector<FramebufferTextureSpecification> m_ColorAttachmentSpecifications;
	FramebufferTextureSpecification m_DepthAttachmentSpecification = FramebufferTextureFormat::None;
	std::vector<uint32_t> m_ColorAttachments;
	uint32_t m_DepthAttachment = 0;
};

Ref<Framebuffer> Framebuffer::Create(const FramebufferSpecification& specification)
{
	if (Renderer::GetAPI() == RendererAPI::API::OpenGL)
		return CreateRef<WebFramebuffer>(specification);
	TC_Core_Assert(false, "Framebuffer requires an OpenGL/WebGL renderer");
	return nullptr;
}

} // namespace TomCat

"""
Static editable pages (Did You Know, Course Materials, etc.)
Admins can edit these pages with markdown content.
"""
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask import request
from .models import db
from .utils import role_required
from http import HTTPStatus
import sqlalchemy as sa
from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime

ns = Namespace("static-pages", description="Static editable pages")

# Model for static pages
class StaticPage(db.Model):
    __tablename__ = "static_pages"
    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)  # Markdown content
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, nullable=True)  # user_id who last updated


def init_static_pages_table():
    """Initialize the static_pages table. Called from app factory."""
    try:
        db.create_all()
    except Exception as e:
        print(f"Warning: Could not create static_pages table: {e}")


@ns.route("/<string:page_key>")
class StaticPageResource(Resource):
    def get(self, page_key: str):
        """Get static page content (public)."""
        page = StaticPage.query.filter_by(key=page_key).first()
        if not page:
            # Return default empty content if page doesn't exist yet
            return {
                "key": page_key,
                "title": page_key.replace("_", " ").replace("-", " ").title(),
                "content": "",
                "updated_at": None,
                "updated_by": None
            }, HTTPStatus.OK
        
        return {
            "key": page.key,
            "title": page.title,
            "content": page.content or "",
            "updated_at": page.updated_at.isoformat() if page.updated_at else None,
            "updated_by": page.updated_by
        }, HTTPStatus.OK
    
    @jwt_required()
    @role_required("admin")
    def put(self, page_key: str):
        """Update static page content (admin only)."""
        data = request.json or {}
        title = data.get("title", "").strip()
        content = data.get("content", "")
        
        if not title:
            return {"error": "Title is required"}, HTTPStatus.BAD_REQUEST
        
        user_id = int(get_jwt_identity())
        
        page = StaticPage.query.filter_by(key=page_key).first()
        if page:
            page.title = title
            page.content = content
            page.updated_at = datetime.utcnow()
            page.updated_by = user_id
        else:
            page = StaticPage(
                key=page_key,
                title=title,
                content=content,
                updated_by=user_id
            )
            db.session.add(page)
        
        db.session.commit()
        
        return {
            "key": page.key,
            "title": page.title,
            "content": page.content or "",
            "updated_at": page.updated_at.isoformat() if page.updated_at else None,
            "updated_by": page.updated_by
        }, HTTPStatus.OK


@ns.route("")
class StaticPageList(Resource):
    @jwt_required()
    @role_required("admin")
    def get(self):
        """List all static pages (admin only)."""
        pages = StaticPage.query.all()
        return [{
            "key": p.key,
            "title": p.title,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "updated_by": p.updated_by
        } for p in pages], HTTPStatus.OK
